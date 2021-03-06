'use strict';

/* global leafletPip */
/* global L */

angular.module('sauWebApp')
  .directive('regionDataMap', function() {
    var controller = function($scope, $timeout, $q, mapConfig, leafletBoundsHelpers, leafletData, sauAPI,
                              createDisputedAreaPopup, ga) {

      var isDisputedAreaPopupOpen = false;
      var selectedRegions = [];
      var ifaLayer, faoLayerGroup;

      angular.extend($scope, {
        defaults: mapConfig.defaults,
        maxbounds: mapConfig.worldBounds,
        center: { lat: 0, lng: 0, zoom: 3 },
        layers: { baselayers: mapConfig.baseLayers }
      });

      // add oceans
      leafletData.getMap('region-data-minimap').then(function(map) {
        L.esri.basemapLayer('Oceans').addTo(map);
        L.esri.basemapLayer('OceansLabels').addTo(map);
      });


      /*
       * watchers
       */

      $scope.$watch('region.name', drawRegions);
      $scope.$watch('region.id', centerMap);
      $scope.$watch('faos', drawFAO);


      /*
       * helper functions
       */

      // center map on selected region
      function centerMap(regionId) {
        sauAPI.Region.get(
          { region: $scope.region.name, region_id: regionId },
          function(res) {
            // keep track of region ids
            selectedRegions = [regionId];

            // get bounds, record multiple region ids, and zoom map
            leafletData.getMap('region-data-minimap').then(function(map) {
              if (res.data && res.data.geojson) {
                var f = L.geoJson(res.data.geojson, { style: mapConfig.defaultStyle });
                var bounds = f.getBounds();
                map.fitBounds(bounds);
                $scope.disabled = false;

                // handle maps with multiple eezs
              } else if (res.data && res.data.eezs && res.data.eezs[0].geojson) {
                var group = new L.featureGroup(res.data.eezs.map(function(eez) {
                  selectedRegions.push(eez.id);
                  return L.geoJson(eez.geojson, { style: mapConfig.defaultStyle });
                }));
                map.fitBounds(group.getBounds());
                $scope.disabled = false;

              } else {
                map.setZoom(1);
                $scope.disabled = true;
              }

              // handle IFA
              drawIFA();

              // restyle all layers
              restyleLayers();
            });
          },
          function() { $scope.disabled = true; }
        );
      }

      // draw IFA for EEZs
      function drawIFA() {
        leafletData.getMap('region-data-minimap').then(function(map) {
          // clear IFA layer if its present
          if (ifaLayer) {
            map.removeLayer(ifaLayer);
          }

          // draw IFA if appropriate
          if ($scope.region.name === 'eez' && $scope.region.id) {
            sauAPI.IFA.get({ region_id: $scope.region.id }, function(res) {
              ifaLayer = L.geoJson(res.data.geojson, { style: mapConfig.ifaStyle }).addTo(map);
            });
          }
        });
      }

      // draw FAOs for EEZs
      function drawFAO() {
        leafletData.getMap('region-data-minimap').then(function(map) {
          // clear FAO layer if its present
          if (faoLayerGroup) {
            map.removeLayer(faoLayerGroup);
          }

          // draw FAO if appropriate
          if ($scope.region.name === 'eez' && $scope.region.id && $scope.faos) {
            $q.all($scope.faos.map(function(fao) {
                return sauAPI.Region.get({ region: 'fao', region_id: fao.id }).$promise;
              })
            ).then(function(res) {
                faoLayerGroup = L.layerGroup(res.map(function(fao) {
                  var layer = L.geoJson(fao.data.geojson, {
                    style: fao.data.id === $scope.region.faoId ? mapConfig.selectedFaoStyle : mapConfig.faoStyle
                  });

                  // mark FAO id on each layer
                  layer.faoId = fao.data.id;

                  return layer;
                })).addTo(map);
            });
          }
        });
      }

      // add region geojson
      function drawRegions(name) {
        sauAPI.Regions.get(
          { region: name === 'eez-bordering' ? 'eez' : name },
          function(res) {
            leafletData.getMap('region-data-minimap').then(function(map) {
              if (res.data && res.data.features) {
                L.geoJson(res.data.features, {
                  style: mapConfig.defaultStyle,
                  onEachFeature: function(feature, layer) {
                    layer.on({
                      click: function(event) {
                        geojsonClick(feature, event.latlng);
                      },
                      mouseover: function(event) {
                        geojsonMouseover(event, feature, map);
                      },
                      mousemove: function(event) {
                        geojsonMouseover(event, feature, map);
                      },
                      mouseout: function(event) {
                        geojsonMouseout(event, feature, map);
                      }
                    });
                  }
                }).addTo(map);

                // restyle all layers
                restyleLayers();
              }
            });
          },
          function() { $scope.disabled = true; }
        );
      }

      // handle geojson click
      function geojsonClick(feature, latlng) {
        /* handle clicks on overlapping layers */
        leafletData.getMap('region-data-minimap').then(function(map) {
          map.closePopup();

          var layers = leafletPip.pointInLayer(latlng, map);
          var featureLayers = layers.filter(function(l) {
            //TODO have eez-bordering and country-eez endpoints to return geojson
            var regionTypeName = $scope.region.name === 'eez-bordering' ? 'eez' : $scope.region.name;
            // only return layers which have a feature of the current region type
            return (l.feature && l.feature.properties.region === regionTypeName);
          });

          if (featureLayers.length > 1) {
            var popup = createDisputedAreaPopup($scope.region.name, featureLayers);

            ga.sendEvent({
              category: 'MiniMap Click',
              action: $scope.region.name.toUpperCase(),
              label: '(Disputed)'
            });

            popup.setLatLng(latlng);
            //I have to open the disputed area popup on a timeout due to a bug that occurs in Chrome on Windows (only).
            //If a popup closes and then opens in the same tick, then the "popupclose" event doesn't fire.
            //If the popupclose event doesn't fire, then the hover popup won't close, resulting in both popups being open at the same time.
            $timeout(function() {
              map.openPopup(popup);
              isDisputedAreaPopupOpen = true;
            });

          } else {
            ga.sendEvent({
              category: 'MiniMap Click',
              action: $scope.region.name.toUpperCase(),
              label: feature.properties.title
            });

            $scope.region.id = feature.properties.region_id;
            $scope.region.ids = [$scope.region.id];

            $scope.$parent.$parent.region = $scope.region;

            // restyle all layers
            restyleLayers();
          }
        });
      }

      // handle geojson mouseover
      function geojsonMouseover(event, feature, map) {
        event.layer.setStyle(mapConfig.highlightStyle);
        if (!isDisputedAreaPopupOpen) {
          new L.Rrose({ offset: new L.Point(0, -10, false), closeButton: false, autoPan: false })
            .setContent(feature.properties.title)
            .setLatLng(event.latlng)
            .openOn(map);
        }
      }

      // handle geojson mouseout
      function geojsonMouseout(event, feature, map) {
        styleLayer(feature, event.layer);
        if (!isDisputedAreaPopupOpen) {
          map.closePopup();
        }
      }

      // restyle all layers
      function restyleLayers() {
        leafletData.getMap('region-data-minimap').then(function(map) {
          map.eachLayer(function(l) {
            if (l.feature) {
              styleLayer(l.feature, l);
            }
          });

          // keep IFA style
          if (ifaLayer) {
            ifaLayer.setStyle(mapConfig.ifaStyle);
            try {
              ifaLayer.bringToFront();
            } catch(e) {
              angular.noop(); // bringToFront doesn't always work
            }
          }

          // keep FAO style
          if (faoLayerGroup) {
            faoLayerGroup.getLayers().forEach(function(layer) {
              layer.setStyle(
                $scope.region.faoId && layer.faoId === $scope.region.faoId ?
                mapConfig.selectedFaoStyle :
                mapConfig.faoStyle
              );
              layer.bringToFront();
            });
          }
        });
      }

      // re-style single region
      function styleLayer(feature, layer, style) {
        if (!layer) {
          return;
        }
        style = style || mapConfig.defaultStyle;
        if (feature && selectedRegions.indexOf(feature.properties.region_id) !== -1) {
          style = mapConfig.selectedStyle;
        }
        layer.setStyle(style);
      }
    };

    return {
      controller: controller,
      link: function(scope, ele) {
        // don't show on multi regions or global
        if (!scope.region.id || scope.region.name == 'global') {
          ele.hide();
        }
      },
      restrict: 'E',
      scope: { region: '=', faos: '=' },
      template: '<leaflet layers="layers" id="region-data-minimap" ' +
        'maxbounds="maxbounds" center="center" defaults="defaults" ' +
        'ng-class="{\'disabled\': disabled}"></leaflet>'
    };
  });
