(function(angular) {
  'use strict';
  angular.module('scrollable-table', [])

  .directive('scrollableTable', ['$timeout', '$q', '$parse', function($timeout, $q, $parse) {
    return { 
      transclude: true,
      restrict: 'E',
      scope: {
        rows: '=watch',
        grid: '=',
        sortFn: '='
      },
      template: '<div class="scrollableContainer">' + 
          '<div class="headerSpacer"></div>' + 
          '<div class="scrollArea" ng-transclude></div>' + 
        '</div>',
      controller: ['$scope', '$element', '$attrs', function($scope, $element, $attrs) {
        // define an API for child directives to view and modify sorting parameters
        this.getSortExpr = function() {
          return $scope.sortExpr;
        };
        this.isAsc = function() {
          return $scope.asc;
        };
        this.setSortExpr = function(exp) {
          $scope.asc = true;
          $scope.sortExpr = exp;
        };
        this.toggleSort = function() {
          $scope.asc = !$scope.asc;
        };

        this.doSort = function(comparatorFn) {
          if(comparatorFn) {
            $scope.rows.sort(function(r1, r2) {
              return comparatorFn(r1, r2, $scope.sortExpr, !$scope.asc);
            });
          } else {
            $scope.rows.sort(function(r1, r2) {
              var compared = defaultCompare(r1, r2);
              return $scope.asc ? compared : compared * -1;
            }); 
          }     
        };

        function defaultCompare(row1, row2) {
          var exprParts = $scope.sortExpr.match(/(.+)\s+as\s+(.+)/);
          var scope = {};
          scope[exprParts[1]] = row1;
          var x = $parse(exprParts[2])(scope);

          scope[exprParts[1]] = row2;
          var y = $parse(exprParts[2])(scope);

          if (x === y) return 0;
          return x > y ? 1 : -1;
        }

        function scrollToRow(row) {
          var offset = $element.find(".headerSpacer").height();
          var currentScrollTop = $element.find(".scrollArea").scrollTop();
          $element.find(".scrollArea").scrollTop(currentScrollTop + row.position().top - offset);
        }

        $scope.$on('rowSelected', function(event, rowId) {
          var row = $element.find(".scrollArea table tr[row-id='" + rowId + "']");
          if(row.length === 1) {
            // Ensure that the headers have been fixed before scrolling, to ensure accurate
            // position calculations
            $q.all([waitForRender(), headersAreFixed.promise]).then(function() {
              scrollToRow(row);
            });
          }
        });

        // Set fixed widths for the table headers in case the text overflows.
        // There's no callback for when rendering is complete, so check the visibility of the table
        // periodically -- see http://stackoverflow.com/questions/11125078
        function waitForRender() {
          var deferredRender = $q.defer();
          function wait() {
            if($element.find("table:visible").length === 0) {
              $timeout(wait, 100);
            } else {
              deferredRender.resolve();
            }
          }
          $timeout(wait);
          return deferredRender.promise;
        }

        var headersAreFixed = $q.defer();
        function fixHeaderWidths() {
          if(!$element.find("thead th .th-inner").length)
            $element.find("thead th").wrapInner('<div class="th-inner"></div>');
          $element.find("table th .th-inner").each(function(index, el) {
            el = $(el);
            var padding = el.outerWidth() - el.width();
            var width = el.parent().width() - padding; 
            // if it's the last header, add space for the scrollbar equivalent unless it's centered
            var lastCol = $element.find("table th:visible:last");
            if(lastCol.css("text-align") !== "center") {
              var hasScrollbar = $element.find(".scrollArea").height() < $element.find("table").height();;
              if(lastCol[0] == el.parent()[0] && hasScrollbar) {
                width += $element.find(".scrollArea").width() - $element.find("tbody tr").width();
              }
            }

            el.css("width", width);
            var title = el.parent().attr("title");
            if(!title) {
              title = el.children().length ? el.find(".title .ng-scope").html() : el.html();
            }
            el.attr("title", title.trim());
          });
          $element.find(".scrollableContainer").css("width", $element.find(".fix-table-width").width());
          headersAreFixed.resolve();
        }

        angular.element(window).on('resize', fixHeaderWidths);

        // when the data model changes, fix the header widths.  See the comments here:
        // http://docs.angularjs.org/api/ng.$timeout
        $scope.$watch('rows', function(newValue, oldValue) {
          if(newValue) {
              waitForRender().then(fixHeaderWidths)
          }
        });

        this.addHidableColumn = function(key, title) {
          $scope.grid.hidableColumns.push({key: key, title: title});
        };

        $scope.$watch('grid.hiddenColumns', function(newValue) {
          waitForRender().then(fixHeaderWidths)
        }, true);

        $scope.asc = !$attrs.hasOwnProperty("desc");
        $scope.sortAttr = $attrs.sortAttr;

        $element.find(".scrollArea").scroll(function(event)
        {
          $element.find("thead th .th-inner").css('margin-left', 0 - event.target.scrollLeft);
        });
      }]
    };
  }])
  .directive('sortableHeader', function() {
    return { 
      transclude: true,
      scope: true,
      require: '^scrollableTable',
      template: '<div ng-mouseenter="enter()" ng-mouseleave="leave()" ng-click="toggleSort()">' +
          '<div class="title" ng-transclude></div>' +
          '<span class="orderWrapper">' + 
            '<span class="order" ng-show="focused || isActive()">' +
              '<i ng-show="isAscending()" class="fa fa-arrow-up"></i>' +
              '<i ng-show="!isAscending()" class="fa fa-arrow-down"></i>' +
            '</span>' + 
          '</span>' + 
        '</div>',
      link: function(scope, elm, attrs, tableController) {
        var expr = attrs.on || "a as a." + attrs.col,
            column;
        scope.isActive = function() {
          return tableController.getSortExpr() === expr;
        };
        scope.toggleSort = function() {
          if(scope.isActive()) {
            tableController.toggleSort();
          } else {
            tableController.setSortExpr(expr);
          }
          tableController.doSort(scope[attrs.comparatorFn]);
        };
        scope.isAscending = function() {
          if(scope.focused && !scope.isActive()) {
            return true;
          } else {
            return tableController.isAsc();
          }
        };

        scope.enter = function() {
          scope.focused = true;
        };
        scope.leave = function() {
          scope.focused = false;
        };

        if (attrs.hidable) {
          column = elm.find('.title > span');
          if (!column.length) {
            column = elm;
          }
          tableController.addHidableColumn(attrs.col, column.attr('translate') ? column.attr('translate') : column.text());
        }
      }
    };
  })
  ;
})(angular);
