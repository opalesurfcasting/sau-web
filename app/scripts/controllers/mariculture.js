;(function() {

  /* global L */

  'use strict';

  angular.module('sauWebApp').controller('MaricultureCtrl', function($scope, $resource, $location, mapConfig, sauAPI, leafletData, leafletBoundsHelpers) {

    $scope.region = {name: 'mariculture'};

    angular.extend($scope, {
      center: {
        lat: 0,
        lng: 0,
        zoom: 2
      },
      defaults: mapConfig.defaults,
      layers: {
        baselayers: mapConfig.baseLayers
      },
      maxbounds: leafletBoundsHelpers.createBoundsFromArray([[-89, -200],[89, 200]])
    });

    leafletData.getMap('mainmap').then(function(map) {
      $scope.map = map;
      L.esri.basemapLayer('Oceans').addTo(map);
      L.esri.basemapLayer('OceansLabels').addTo(map);
    });

    $scope.selected = function(feature) {
      $location.path('/mariculture/' + feature.c_number);
    };

    // these functions are required to exist by
    // minimap. Fake it 'till you make it.
    $scope.geojsonClick = function() {};
    $scope.geojsonMouseout = function() {};
    $scope.geojsonMouseover = function() {};

    $scope.features = sauAPI.Regions.get({region: 'country'});
    $scope.features.$promise.then(function(data) {
        angular.extend($scope, {
          geojson: {
            data: data.data,
            style: mapConfig.countryStyle,
            onEachFeature: function(feature, layer) {
              layer.on({
                click: function() {
                  $scope.selected(layer.feature.properties);
                },
                mouseover: function() {
                  layer.setStyle(mapConfig.selectedStyle);
                },
                mouseout: function() {
                  layer.setStyle(mapConfig.countryStyle);
                }
              });
            }
          }
        });
      });
  });
})();