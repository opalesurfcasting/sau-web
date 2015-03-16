'use strict';

/* global angular */

angular.module('sauWebApp')
  .controller('MultinationalFootprintCtrl', function ($scope, $routeParams, sauAPI, externalURLs) {
    var data = sauAPI.MultinationalFootprintData.get({region: $scope.region.name, region_id: $routeParams.id}, function() {
            $scope.data = data.data;
        });

    $scope.methodURL = externalURLs.docs + 'saup_manual.htm#13';

    $scope.feature.$promise.then(function() {
      $scope.updateChartTitle('Primary Production Required for catches in the waters of ' + $scope.feature.data.title);
    });

    $scope.options = {
      chart: {
          type: 'stackedAreaChart',
          height: 350,
          margin : {
              top: 20,
              right: 0,
              bottom: 60,
          },
          x: function(d){return d[0];},
          y: function(d){return d[1];},
          transitionDuration: 250,
          useInteractiveGuideline: true,
          xAxis: {
              showMaxMin: false,
              tickValues: [1950,1960,1970,1980,1990,2000,2010,2020],
              axisLabel: 'Year'
          },
          yAxisTickFormat: function(d) {
            return Number(d).toFixed(3).toString();
          },
          yAxis: {
              axisLabel: 'Fraction of prim.prod.'
          }
        }
      };
  });