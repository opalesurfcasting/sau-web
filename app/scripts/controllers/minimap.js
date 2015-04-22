'use strict';

/* global leafletPip */
/* global L */

angular.module('sauWebApp')
  .controller('MiniMapCtrl', function ($scope, $rootScope, $q, $timeout, sauAPI, mapConfig, leafletBoundsHelpers, leafletData) {

    angular.extend($scope, {
      defaults: mapConfig.defaults,
      layers: {
        baselayers: mapConfig.baseLayers
      }
    });

    // add IFA boundaries
    var getIFA = function() {
      $scope.ifa = sauAPI.IFA.get({region_id: $scope.formModel.region_id}, function() {
        leafletData.getMap('minimap').then(function(map) {
          if($scope.ifaLayer) {
            map.removeLayer($scope.ifaLayer);
          }
          $scope.ifaLayer = L.geoJson($scope.ifa.data.geojson, {style: mapConfig.ifaStyle}).addTo(map);
        });
      });
    };

    var styleLayer = function(feature, layer, style) {
      if (!layer) {
        return;
      }
      style = style || mapConfig.defaultStyle;
      if(feature.properties.region_id === $scope.formModel.region_id) {
        layer.setStyle(mapConfig.selectedStyle);
      } else {
        layer.setStyle(style);
      }
    };

    var geojsonClick = function(feature, latlng) {
      /* handle clicks on overlapping layers */
      leafletData.getMap('minimap').then(function(map) {

        var layers = leafletPip.pointInLayer(latlng, map);
        var featureLayers = layers.filter(function(l) {
          // only return layers which have a feature of the current region type
          return (l.feature && (l.feature.properties.region === $scope.region.name));
        });

        if (featureLayers.length > 1) {
          var content = 'Area disputed by (';
          content += featureLayers.map(function(l) {return l.feature.properties.title;}).join(', ');
          content += ')';
          leafletData.getMap('minimap').then(function(map) {
            map.openPopup(content, latlng);
          });
        } else {
          $scope.formModel.region_id = feature.properties.region_id;
          $scope.styleSelectedFeature();

          if ($scope.region.name === 'eez') {
            $timeout(function() {
              if (! $scope.mapLayers.selectedFAO ) {
                drawFAO();
              } else {
                $scope.mapLayers.selectedFAO = undefined;
              }
            });
          }
        }
      });

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

    $scope.$watch('formModel', function() {
      leafletData.getMap('minimap')
        .then(function(map) {
          $scope.feature.$promise.then(function() {
            var f = L.geoJson($scope.feature.data.geojson);
            var bounds = f.getBounds();
            map.fitBounds(bounds);
          });
        });
    }, true);

    $scope.eachFeatureLayer = function(cb) {
      leafletData.getMap('minimap')
      .then(function(map) {
        map.eachLayer(function(l){
          if (l.feature) {
            cb(l);
          }
        });
      });
    };

    $scope.styleSelectedFeature = function () {
      $scope.eachFeatureLayer(function(l) {
        styleLayer(l.feature, l);
      });
      if ($scope.region.name === 'eez') {
        getIFA();
      }
    };

    $scope.faoLayers = [];

    var drawFAO = function() {
      $scope.removeFAO();

      var addFAOLayer = function(layer, style) {
        leafletData.getMap('minimap').then(function(map) {
          layer.setStyle(style);
          layer.addTo(map);
          $scope.faoLayers.push(layer);
        });
      };

      $q.all([$scope.feature.$promise, $scope.faos.promise, $scope.faoData.$promise]).then(function() {
        $scope.faoLayer = L.geoJson($scope.faoData.data, {
          onEachFeature: function(feature, layer) {
            if(isFAOInThisRegion(feature.properties.region_id)) {
              if (feature.properties.region_id === $scope.mapLayers.selectedFAO) {
                addFAOLayer(layer, mapConfig.selectedFaoStyle);
              } else {
                addFAOLayer(layer, mapConfig.faoStyle);
              }
            }
          }
        });
      });
    };

    $scope.removeFAO = function() {
      leafletData.getMap('minimap').then(function(map) {
        for(var i=0; i<$scope.faoLayers.length; i++) {
          map.removeLayer($scope.faoLayers[i]);
        }
        $scope.faoLayers = [];
      });
    };

    $scope.features.$promise.then(function() {
      // add features layer when loaded, then load IFA and FAO so they get painted on top
      leafletData.getMap('minimap').then(function(map) {

        L.geoJson($scope.features.data.features, {
          style: mapConfig.defaultStyle,
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
        $scope.styleSelectedFeature();
        $scope.$watch('mapLayers.selectedFAO', function(){
          leafletData.getMap('minimap').then(function(map) {
            if ($scope.faoData) {
              $scope.faoData.$promise.then(function() {
                drawFAO(map);
              });
            }
          });
        });
      });
    });

    function isFAOInThisRegion(faoId) {
      for (var i = 0; i < $scope.faos.data.length; i++) {
        if ($scope.faos.data[i].id === faoId) {
          return true;
        }
      }
      return false;
    }
  });
