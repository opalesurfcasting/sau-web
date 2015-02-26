'use strict';

/* global angular */

angular.module('sauWebApp')
  .controller('MarineTrophicIndexCtrl', function ($scope, $routeParams, sauAPI, region) {

    $scope.years = [];

    var id = $scope.region_id || $routeParams.id;

    $scope.region = sauAPI.Region.get({region: region, region_id: id});

    var data = sauAPI.MarineTrophicIndexData.get({region: region, region_id: id}, function() {

      $scope.data = data.data;
      angular.forEach($scope.data, function(time_series) {
          var nullFilteredData = time_series.values.filter(function(x) {
            return x[1];
          });
          time_series.values = nullFilteredData;
          $scope[time_series.key] = [time_series];
      });

      angular.forEach($scope.data[0].values, function(xy) {
        if (xy[1]) {
          $scope.years.push(xy[0]);
        }
      });

    });
  });
