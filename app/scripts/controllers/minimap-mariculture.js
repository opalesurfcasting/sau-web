'use strict';

/* global d3 */
/* global L */

angular.module('sauWebApp')
  .controller('MiniMapMaricultureCtrl', function ($scope, $rootScope, $q, $timeout, sauAPI, mapConfig, leafletBoundsHelpers, leafletData) {

    if ($scope.region.name === 'mariculture') {
      $scope.selectedProvince = {feature: null};
      $scope.selectedMaricultureProvince = function(province) {
        console.log(province);
      };
    }

    angular.extend($scope, {
      defaults: mapConfig.defaults,
      layers: {
        baselayers: mapConfig.baseLayers
      }
    });

    var styleLayer = function(feature, layer, style) {
      if (!layer) {
        return;
      }
      style = style || mapConfig.defaultStyle;
      if(feature.properties.region_id === $scope.formModel.region_id) {
      } else {
      }
    };

    var geojsonClick = function(feature) {
      console.log('clicked ', feature);
    };

    var geojsonMouseout = function(ev, feature) {
      $rootScope.hoverRegion = {};
      styleLayer(feature, ev.layer);
    };

    var geojsonMouseover = function(ev, feature) {
      $rootScope.hoverRegion = feature;
      styleLayer(feature, ev.layer, mapConfig.highlightStyle);
    };

    leafletData.getMap('minimap').then(function(map) {
      L.esri.basemapLayer('Oceans').addTo(map);
      L.esri.basemapLayer('OceansLabels').addTo(map);
    });

    $scope.features.$promise.then(function() {
      // add features layer when loaded
      leafletData.getMap('minimap').then(function(map) {
        var points = [];
        var colorScale = d3.scale.quantize().domain([0,100,1000,10000,100000,100000000]).range(['green', '#0f0', 'yellow', 'orange', 'pink', 'red']);
        angular.forEach($scope.features.data, function(feature) {
          if(! feature.point_geojson) {
            return;
          }
          feature.point_geojson.properties = {
            title: feature.title,
            region_id: feature.region_id,
          };
          // 2 visual dimensions representing the same value. The sea fills with Tufte's tears.
          var metric = feature.total_production * 1000.0;
          var pointSize = 1.5*Math.log10(metric/500.0);
          var color = colorScale(metric);

          L.geoJson(feature.point_geojson, {
            pointToLayer: function (feature, latlng) {
              return L.circleMarker(latlng, {
                fillColor: color,
                color: '#000',
                fillOpacity: 0.8,
                opacity: 0.8,
                weight: 1,
                radius: pointSize,
                stroke: true
              });
            },
            onEachFeature: function(feature, layer) {
              layer.on({
                click: function(e) {
                  geojsonClick(feature, e.latlng);
                },
                mouseover: function(e) {geojsonMouseover(e, feature);},
                mouseout: function(e) {geojsonMouseout(e, feature); }
              });
            }
          }).addTo(map);
          var point = feature.point_geojson.coordinates[0];
          point.reverse();
          points.push(point);
        });
        var bounds = L.latLngBounds(points);
        map.fitBounds(bounds);
      });
    });

  });
