'use strict';

angular.module('sauWebApp')
  .directive('highSeasVsEezs', function() {
    var controller = function($scope, sauAPI) {
      angular.extend($scope, {
        colors: ['#f00', '#00f'],
        options: {
          chart: {
            showControls: false,
            style: 'expand',
            type: 'stackedAreaChart',
            height: 350,
            x: function(d) { return d[0]; },
            y: function(d) { return d[1]; },
            useInteractiveGuideline: true,
            xAxis: {
              showMaxMin: false,
              tickValues: [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]
            },
            yAxis: {
              axisLabel: 'Percent of global catch'
            }
          }
        }
      });

      sauAPI.EEZVsHighSeasData.get(function(res) {
        var fancyLabels = {
          'eez_percent_catch': 'EEZ percent catch',
          'high_seas_percent_catch': 'High Seas percent catch'
        };
        $scope.data = res.data.map(function(datum) {
          datum.key = fancyLabels[datum.key];
          return datum;
        });
      });
    };

    return {
      controller: controller,
      restrict: 'E',
      replace: true,
      template: '<nvd3 options="options" data="data" api="api"></nvd3>'
    };
  });
