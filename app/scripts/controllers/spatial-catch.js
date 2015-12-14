'use strict';

/* global d3 */

angular.module('sauWebApp').controller('SpatialCatchMapCtrl',
  function ($scope, fishingCountries, taxa, commercialGroups, functionalGroups, sauAPI, $timeout, $location, $filter, $q, createQueryUrl, eezSpatialData, SAU_CONFIG, ga, spatialCatchExamples, reportingStatuses, catchTypes, toggles, spatialCatchThemes, makeCatchMapScale) {
    //SAU_CONFIG.env = 'stage'; //Used to fake the staging environment.

    //////////////////////////////////////////////////////
    //SCOPE METHODS
    //////////////////////////////////////////////////////
    $scope.submitQuery = function (query, visibleYear) {
      clearGrid();
      $scope.loadingProgress = 0;
      numQueriesMade++;
      $scope.lastQuery = angular.copy(query);
      updateUrlFromQuery();
      $scope.queryResponseErrorMessage = null;
      $scope.lastQuerySentence = getQuerySentence(query, visibleYear);
      $scope.catchGraphLinkText = getCatchGraphLinkText(query);
      $scope.catchGraphLink = getCatchGraphLink(query);

      $scope.loadingText = 'Downloading cells';
      $scope.queryResolved = false;

      //Form the query...
      var queryParams = {format: 'binary'};
      var gaAction = ['query'];

      //...Fishing countries
      if (query.isFilteredBy('fishingCountries')) {
        queryParams.entities = query.fishingCountries.join(',');
        //Form GA event action
        if (query.fishingCountries.length > 1) {
          gaAction.push(['multi-entity']);
        } else {
          gaAction.push(['single-entity']);
        }
      } else {
        gaAction.push(['global-entity']);
      }

      switch (query.catchesBy) {
        //...Taxa
        case 'taxa':
          if (query.isFilteredBy('taxa')) {
            queryParams.taxa = query.taxa.join(',');

            //Form GA event action
            if (query.taxa.length > 1) {
              gaAction.push(['multi-taxa']);
            } else {
              gaAction.push(['single-taxa']);
            }
          }
          break;
        //...Commercial groups
        case 'commercial groups':
          if (query.isFilteredBy('commercialGroups')) {
            queryParams.commgroups = query.commercialGroups.join(',');

            //Form GA event action
            if (query.commercialGroups.length > 1) {
              gaAction.push(['multi-commgroup']);
            } else {
              gaAction.push(['single-commgroup']);
            }
          }
          break;
        //...Functional groups
        case 'functional groups':
          if (query.isFilteredBy('functionalGroups')) {
            queryParams.funcgroups = query.functionalGroups.join(',');

            //Form GA event action
            if (query.functionalGroups.length > 1) {
              gaAction.push(['multi-funcgroup']);
            } else {
              gaAction.push(['single-funcgroup']);
            }
          }
          break;
      }

      if ($scope.isAllocationQueryValid($scope.lastQuery)) {
        //Request data about the grid scale, relative to all years.
        $timeout(function requestMapScale() {
          $scope.minCatch = 0; //d3Scale.invertExtent(d3Range[0])[0]; //Gets the smallest value in the scale.
          $scope.maxCatch = 70; //d3Scale.invertExtent(d3Range[d3Range.length - 1])[1]; //Gets the largest value in the scale.
          $scope.totalCatch = 0;
          var quantiles = [0.00001, 0.0002, 0.003, 0.04, 0.5, 6]; //d3Scale.quantiles().slice(); //Slice makes a copy of the array, so we can manipulate it without messing up the scale.
          var quantilesAndExtrema = quantiles.slice(); //Makes a copy
          quantilesAndExtrema.unshift($scope.minCatch);
          quantilesAndExtrema.push($scope.maxCatch);
          $scope.boundaryLabels = createQuantileBoundaryLabels(quantilesAndExtrema);
          map.colorScale = makeCatchMapScale(quantiles, $scope.theme.scale.slice()); //Maps cell values to their colors on a rainbow color range.

          //Request the current year so that the user can look at it while the other years are loading.
          queryParams.year = visibleYear;
          return sauAPI.SpatialCatchData.get(queryParams);
        })
        //Process visible year response
        .then(function processCurrYear(currYearResponse) {

          $scope.queryResolved = true;
          $scope.loadingProgress = 1;

          //Rendering the visible year is main-thread-blocking, so we delay it a bit to make sure that the
          //mega array request gets fired first.
          $timeout(function makeFirstYearLayer() {
            var layerData = transformCatchResponse(currYearResponse.data);
            makeGridLayer(layerData, visibleYear);
          }, 100);

          //Request all years.
          delete queryParams.year;
          return sauAPI.SpatialCatchData.get(queryParams);
        })
        //Process all years
        .then(function processAllYears(allYearsResponse) {
          var superGridData = transformCatchResponse(allYearsResponse.data);

          //Makes a grid layer for each year. NOTE: VERY SLOW
          forEachYear(function makeAllGrids(currYear, yearIndex) {
            if (currYear === visibleYear) {
              return;
            }
            var bufferOffsetForYear = yearIndex * numCellsInGrid * Float32Array.BYTES_PER_ELEMENT;
            var gridDataForYear = new Float32Array(superGridData.buffer, bufferOffsetForYear, numCellsInGrid);
            makeGridLayer(gridDataForYear, currYear);
          });
        });

      }

      //Google Analytics Event
      ga.sendEvent({
        category: 'Mapped Catch',
        action: gaAction.join(' '),
        label: $location.url()
      });
    };

    //Return true if any data except the year is different.
    //Returns false if all data is the same, or just the year is different.
    $scope.isQueryEqual = function(q1, q2) {
      return angular.equals(q1, q2);
    };

    $scope.isAllocationQueryValid = function(query) {
      if (toggles.isEnabled('global')) {
        return true;
      }

      var hasFishingCountryInput = query && query.isFilteredBy('fishingCountries');

      var hasCatchesByInput = false;
      switch ($scope.query.catchesBy) {
        case 'taxa':
          if (query.isFilteredBy('taxa')) {
            hasCatchesByInput = true;
          }
          break;
        case 'commercial groups':
          if (query.isFilteredBy('commercialGroups')) {
            hasCatchesByInput = true;
          }
          break;
        case 'functional groups':
          if (query.isFilteredBy('functionalGroups')) {
            hasCatchesByInput = true;
          }
          break;
      }

      return hasFishingCountryInput || hasCatchesByInput;
    };

    $scope.isDistributionQueryValid = function(query) {
      return query.taxonDistribution && query.taxonDistribution.length > 0;
    };

    $scope.isQueryValid = function (query) {
      //return $scope.isAllocationQueryValid(query) || $scope.isDistributionQueryValid(query);
      return $scope.isAllocationQueryValid(query);
    };

    $scope.getSelectedBucket = function () {
      return -1;
    };

    $scope.zoomMapIn = function() {
      //Google Analytics Event
      ga.sendEvent({
        category: 'Mapped Catch',
        action: 'zoom',
        label: 'in'
      });

      map.zoomIn();
    };

    $scope.zoomMapOut = function() {
      //Google Analytics Event
      ga.sendEvent({
        category: 'Mapped Catch',
        action: 'zoom',
        label: 'out'
      });

      map.zoomOut();
    };

    $scope.updateQueryWithExample = function (example) {
      $scope.query = angular.extend($scope.query, example);

      //Submit the query
      if ($scope.isQueryValid($scope.query)) {
        $scope.submitQuery($scope.query, example.year);
      }
    };

    $scope.onTimelineRelease = function () {
      /*if ($scope.isQueryValid($scope.query)) {
        $scope.submitQuery($scope.query);
      }*/
    };

    $scope.currentYearHasGrid = function () {
      return gridLayers.forYear($scope.currentYear) ? true : false;
    };

    //////////////////////////////////////////////////////
    //PRIVATE METHODS
    //////////////////////////////////////////////////////
    function transformCatchResponse(response) {
      try {
        return new Float32Array(response);
      } catch (error) {
        console.log('Spatial catch response not parseable into Float32Array.');
        return new Float32Array();
      }
    }

    function makeGridLayer(data, year) {
      //First delete any previous layer in that year slot.
      var oldLayer = gridLayers.forYear(year);
      if (oldLayer) {
        map.removeLayer(oldLayer);
      }

      var showLayer = $scope.currentYear === year;

      //Then make the layer
      var newLayer = map.addLayer(data, {
        gridSize: [720, 360],
        renderOnAnimate: false,
        zIndex: year - firstYearOfData,
        renderOnAdd: showLayer
      });

      //Workaround for this bug: https://github.com/VulcanTechnologies/d3-grid-map/issues/12
      if (!showLayer) {
        newLayer.hide();
      }

      //Add it to the cache
      gridLayers.forYear(year, newLayer);
    }

    function deleteGridLayer(year) {
      //Remove layer from the gridmap
      var deadLayerWalking = gridLayers.forYear(year);
      if (deadLayerWalking) {
        map.removeLayer(deadLayerWalking);
      }

      //Clear the cache reference
      gridLayers.forYear(year, null);
    }

    function clearGrid() {
      forEachYear(deleteGridLayer);
    }

    function updateQueryFromUrl() {
      var search = $location.search();

      //Fishing countries
      if (search.entities) {
        $scope.query.fishingCountries = search.entities.split(',');
      }

      //Taxa, commercial groups, functional groups
      if (search.taxa) {
        $scope.query.catchesBy = 'taxa';
        $scope.query.taxa = search.taxa.split(',');
      } else if (search.commgroups) {
        $scope.query.catchesBy = 'commercial groups';
        $scope.query.commercialGroups = search.commgroups.split(',');
      } else if (search.funcgroups) {
        $scope.query.catchesBy = 'functional groups';
        $scope.query.functionalGroups = search.funcgroups.split(',');
      } else {
        $scope.query.catchesBy = 'taxa';
      }

      //Reporting statuses
      if (search.repstatuses) {
        $scope.query.reportingStatuses = search.repstatuses.split(',');
      }

      //Catch types
      if (search.catchtypes) {
        $scope.query.catchTypes = search.catchtypes.split(',');
      }

      //Year
      $scope.currentYear = Math.min(Math.max(+search.year || lastYearOfData, firstYearOfData), lastYearOfData); //Clamp(year, 1950, 2010). Why does JS not have a clamp function?

      //Taxon distribution
      if (search.dist) {
        $scope.query.taxonDistribution = search.dist.split(',');
      }
    }

    function updateUrlFromQuery() {
      //Fishing countries
      if ($scope.query.isFilteredBy('fishingCountries')) {
        $location.search('entities', $scope.query.fishingCountries.join(','));
      } else {
        $location.search('entities', null);
      }

      var searchValue;
      //Taxa, commercial groups, functional groups
      switch ($scope.query.catchesBy) {
        case 'taxa':
          searchValue = ($scope.query.isFilteredBy('taxa')) ? $scope.query.taxa.join(',') : null;
          $location.search('taxa', searchValue);
          $location.search('commgroups', null);
          $location.search('funcgroups', null);
          break;
        case 'commercial groups':
          searchValue = ($scope.query.isFilteredBy('commercialGroups')) ? $scope.query.commercialGroups.join(',') : null;
          $location.search('taxa', null);
          $location.search('commgroups', searchValue);
          $location.search('funcgroups', null);
          break;
        case 'functional groups':
          searchValue = ($scope.query.isFilteredBy('functionalGroups')) ? $scope.query.functionalGroups.join(',') : null;
          $location.search('taxa', null);
          $location.search('commgroups', null);
          $location.search('funcgroups', searchValue);
          break;
      }

      //Reporting Statuses
      if ($scope.query.reportingStatuses && $scope.query.reportingStatuses.length > 0) {
        $location.search('repstatuses', $scope.query.reportingStatuses.join(','));
      } else {
        $location.search('repstatuses', null);
      }

      //Catch types
      if ($scope.query.catchTypes && $scope.query.catchTypes.length > 0) {
        $location.search('catchtypes', $scope.query.catchTypes.join(','));
      } else {
        $location.search('catchtypes', null);
      }

      //Year
      var queryYear = $scope.currentYear || lastYearOfData;
      if (queryYear !== lastYearOfData) {
        $location.search('year', queryYear);
      } else {
        $location.search('year', null);
      }

      //Taxon distribution
      if ($scope.isDistributionQueryValid($scope.query)) {
        $location.search('dist', $scope.query.taxonDistribution.join(','));
      } else {
        $location.search('dist', null);
      }

      $location.replace();
    }

    function getQuerySentence (query, year) {
      //[All, Unreported, Reported, All] [fishing, landings, Discards, (F)fishing ] [<blank>, of Abolones, of 2 taxa, of 2 commercial groups] by the fleets of [Angola, 2 countries] in [year]
      if (!$scope.isQueryValid(query)) {
        return '';
      }

      var sentence = [];

      //A query is still valid if there are no fishing countries or taxa selected, if instead there are taxa distribution parameters set.
      //But then our typical sentence structure doesn't make any sense.
      if ($scope.taxonDistribution && $scope.taxonDistribution.length > 0) {
        sentence.push('Global distribution of ');
        if (query.taxonDistribution.length === 1) {
          var taxonName = $scope.taxa.find('common_name', query.taxonDistribution[0]);
          sentence.push(taxonName);
        } else {
          sentence.push(query.taxonDistribution.length + ' taxa');
        }
      } else {
        if (!query.isFilteredBy('fishingCountries')) {
          sentence.push('Global');
        } else {
          sentence.push('All');
        }

        //Reporting status
        if (query.reportingStatuses && query.reportingStatuses.length === 1) {
          var reportingStatusName = $scope.reportingStatuses.find('name', query.reportingStatuses[0]);
          sentence.push(reportingStatusName.toLowerCase());
        }

        //Catch type
        if (query.catchTypes && query.catchTypes.length === 1) {
          var catchTypeName = $scope.catchTypes.find('name', query.catchTypes[0]);
          sentence.push(catchTypeName.toLowerCase());
        } else {
          sentence.push('fishing');
        }

        //Catches by
        if (query.catchesBy === 'taxa' && query.isFilteredBy('taxa')) {
          if (query.taxa && query.taxa.length === 1) {
            var taxaName = $scope.taxa.find('common_name', query.taxa[0]);
            sentence.push('of ' + taxaName.toLowerCase());
          } else if (query.taxa && query.taxa.length > 1) {
            sentence.push('of ' + query.taxa.length + ' taxa');
          }
        } else if (query.catchesBy === 'commercial groups' && query.isFilteredBy('commercialGroups')) {
          if (query.commercialGroups && query.commercialGroups.length === 1) {
            var commercialGroupName = $scope.commercialGroups.find('name', query.commercialGroups[0]);
            sentence.push('of ' + commercialGroupName.toLowerCase());
          } else if (query.commercialGroups && query.commercialGroups.length > 1) {
            sentence.push('of ' + query.commercialGroups.length + ' commercial groups');
          }
        } else if (query.catchesBy === 'functional groups' && query.isFilteredBy('functionalGroups')) {
          if (query.functionalGroups && query.functionalGroups.length === 1) {
            var functionalGroupName = $scope.functionalGroups.find('description', query.functionalGroups[0]);
            sentence.push('of ' + functionalGroupName.toLowerCase());
          } else if (query.functionalGroups && query.functionalGroups.length > 1) {
            sentence.push('of ' + query.functionalGroups.length + ' functional groups');
          }
        }

        //Fishing countries
        if (query.isFilteredBy('fishingCountries')) {
          if (query.fishingCountries.length === 1) {
            var countryName = $scope.fishingCountries.find('title', query.fishingCountries[0]);
            sentence.push('by the fleets of ' + countryName);
          } else {
            sentence.push('by the fleets of ' + query.fishingCountries.length + ' countries');
          }
        }

        //Year
        sentence.push('in ' + (year || lastYearOfData));
      }

      return sentence.join(' ');
    }

    function getCatchGraphLinkText (query) {
      if (!query.isFilteredBy('fishingCountries')) {
        return null;
      }

      var text = 'View graph of catches by ' + query.catchesBy + ' by the fleets of ';
      if (query.fishingCountries.length === 1) {
        text += $scope.fishingCountries.find('title', query.fishingCountries[0]);
      } else {
        text += 'the selected countries';
      }

      return text + '.';
    }

    function getCatchGraphLink (query) {
      if (!query.isFilteredBy('fishingCountries')) {
        return null;
      }

      var graphDimension = 'taxon';
      if (query.catchesBy === 'commercial groups') {
        graphDimension = 'commercialgroup';
      } else if (query.catchesBy === 'functional groups') {
        graphDimension = 'functionalgroup';
      }

      //Update the variables that configure the search query.
      var urlConfig = {
        regionType: 'fishing-entity',
        measure: 'tonnage',
        dimension: graphDimension,
        limit: '10',
        regionIds: query.fishingCountries
      };
      return '#' + createQueryUrl.forRegionCatchChart(urlConfig);
    }

    function forEachYear(cb) {
      for (var currYear = firstYearOfData; currYear <= lastYearOfData; currYear++) {
        cb(currYear, currYear - firstYearOfData);
      }
    }

    function createQuantileBoundaryLabels (boundaries) {
      var boundaryLabels = new Array(boundaries.length - 1);

      for (var i = 0; i < boundaries.length - 1; i++) {
        //Each boundary label looks something like this: "8.3e-11 to 2.6e-3 t/km²"
        boundaryLabels[i] = boundaries[i].toExponential(1) + ' to ' + boundaries[i + 1].toExponential(1) + ' t/km²';
      }

      return boundaryLabels;
    }

    function updateYearLayerVisibility() {
      //Hide the old grid layers so that only one is showing at a time.
      forEachYear(function hideAllLayers(year) {
        var layer = gridLayers.forYear(year);
        if (layer) {
          layer.hide();
        }
      });

      //Show the new grid layer.
      var currentYearLayer = gridLayers.forYear($scope.currentYear);
      if (currentYearLayer) {
        currentYearLayer.show();
        currentYearLayer.draw(); //This call shouldn't need to be done by the application, it should be done in the library.
        $scope.lastQuerySentence = getQuerySentence($scope.query, $scope.currentYear);
      }
    }

    //Assign the return value of this function to a function on an array of objects.
    //Pass it the 'key' of the objects, then you can use your new function to query for a value by ID.
    //
    // var people = [person1, person2];
    // people.find = makeArrayQueryable('ssn');
    // people.find('name', '111-11-1111');
    function makeArrayQueryable(key) {
      return function (select, value) {
        for (var i = 0; i < this.length; i++) {
          if (''+this[i][key] === ''+value) {
            return this[i][select];
          }
        }
        return null;
      };
    }

    //////////////////////////////////////////////////////
    //LOCAL VARS
    //////////////////////////////////////////////////////
    var map;
    var firstYearOfData = 1950; //Dynamic later.
    var lastYearOfData = 2010; //Dynamic later.
    var numCellsInGrid = 720 * 360;
    //var lastCatchQueryResponse;
    var numQueriesMade = 0; //Used to tell a query response if it's old and outdated.
    var gridLayers = [];
    gridLayers.forYear = function (year, layer) {
      if (arguments.length === 1) {
        return this[year - firstYearOfData];
      } else {
        this[year - firstYearOfData] = layer;
      }
    };
    //////////////////////////////////////////////////////
    //SCOPE VARS
    //////////////////////////////////////////////////////
    $scope.fishingCountries = fishingCountries.data;
    $scope.fishingCountries.find = makeArrayQueryable('id');
    //"All countries" pseudo-item
    if (toggles.isEnabled('global')) {
      $scope.fishingCountries.unshift({id: 0, title: '-- All fishing countries --'});
    }

    $scope.taxa = taxa.data;
    $scope.taxa.find = makeArrayQueryable('taxon_key');
    for (var i = 0; i < $scope.taxa.length; i++) {
      $scope.taxa[i].displayName = $scope.taxa[i].common_name + ' (' + $scope.taxa[i].scientific_name + ')';
    }

    //"All taxa" pseudo-item
    if (toggles.isEnabled('global')) {
      $scope.taxa.unshift({taxon_key: 0, common_name: '-- All taxa --', displayName: '-- All taxa --'});
    }

    $scope.commercialGroups = commercialGroups.data;
    $scope.commercialGroups.find = makeArrayQueryable('commercial_group_id');
    //"All commercial groups" pseudo-item
    if (toggles.isEnabled('global')) {
      $scope.commercialGroups.unshift({commercial_group_id: '0', name: '-- All commercial groups --'});
    }

    $scope.functionalGroups = functionalGroups.data;
    $scope.functionalGroups.find = makeArrayQueryable('functional_group_id');
    //"All commercial groups" pseudo-item
    if (toggles.isEnabled('global')) {
      $scope.functionalGroups.unshift({functional_group_id: '-1', description: '-- All functional groups --'});
    }

    $scope.mappedCatchExamples = spatialCatchExamples;

    $scope.inProd = SAU_CONFIG.env === 'stage' || SAU_CONFIG.env === 'prod';
    $scope.query = {};
    $scope.currentYear = lastYearOfData;
    $scope.loadingProgress = 1;
    $scope.theme = spatialCatchThemes.nightlyNews;

    //////////////////////////////////////////////////////
    //WATCHERS
    //////////////////////////////////////////////////////
    $scope.$watch('currentYear', updateYearLayerVisibility);
    $scope.$on('$destroy', $scope.$on('$locationChangeSuccess', updateQueryFromUrl));
    $scope.query = {
      //A quick function to find out if a particular query property is filtering the query.
      isFilteredBy: function isFilteredBy (queryProperty) {
        var globalIndex = queryProperty === 'functionalGroups' ? '-1': '0';
        return this[queryProperty] && this[queryProperty].length > 0 && this[queryProperty].indexOf(globalIndex) === -1;
      }
    };

    //////////////////////////////////////////////////////
    //KICKING THINGS OFF
    //////////////////////////////////////////////////////
    d3.json('countries.topojson', function(error, countries) {
      map = new d3.geo.GridMap('#cell-map', {
        seaColor: $scope.theme.ocean,
        graticuleColor: $scope.theme.graticule,
        disableMouseZoom: true,
        onCellHover: function (cell) {
          $scope.cellValue = cell.toExponential(1);
          $scope.$apply();
        }
      });

      map.addLayer(eezSpatialData.data, {
        fillColor: $scope.theme.eezFill,
        strokeColor: $scope.theme.eezStroke,
        renderOnAnimate: false,
        zIndex: 99 //Ensure this layer is far above all of the grid layers. There could be one-per-year.
      });

      map.addLayer(countries, {
        fillColor: $scope.theme.landFill,
        strokeColor: $scope.theme.landStroke,
        zIndex: 100 ////Ensure this layer is far above all of the grid layers. There could be one-per-year.
      });
    });

    updateQueryFromUrl();

    //Boostrap the initial query if there are query params in the URL when the page loads.
    if ($scope.isQueryValid($scope.query)) {
      $scope.submitQuery($scope.query, $scope.currentYear);
    }
  })

  /*
  *
  *
  *
  *
  */
  .factory('spatialCatchThemes', function () {
    return {
      nightlyNews: {
        ocean: 'rgba(51, 125, 211, 1)',
        graticule: 'rgba(255, 255, 255, 0.3)',
        landStroke: 'rgba(255, 255, 255, 1)',
        landFill: 'rgba(251, 250, 243, 1)',
        eezStroke: 'rgba(255, 255, 255, .3)',
        eezFill: 'rgba(255, 255, 255, .15)',
        scale: ['#2ad9eb', '#74f9ae', '#d4f32a', '#fef500', '#fcab07', '#fc6a1b', '#fb2921']
      },
      eLight: {
        ocean: 'rgba(181, 224, 249, 1)',
        graticule: 'rgba(255, 255, 255, 0.3)',
        landStroke: 'rgba(255, 255, 255, 1)',
        landFill: 'rgba(251, 250, 243, 1)',
        eezStroke: 'rgba(255, 155, 155, 1)',
        eezFill: 'rgba(255, 255, 255, .15)',
        scale: ['#77b2ba', '#93d787', '#f0ff4c', '#fadf56', '#ffbd4b', '#fc8a52', '#db1f1a']
      }
    };
  })

  /*
  *
  *
  *
  *
  */
  .factory('makeCatchMapScale', function () {
    return function (thresholds, colors) {
      //Convert the provided colors to a single integer value for faster processing by the D3 grid map.
      for (var i = 0; i < colors.length; i++) {
        var d3Color = d3.rgb(colors[i]);
        var intColor = (255 << 24) | (d3Color.b << 16) | (d3Color.g << 8) | d3Color.r;
        colors[i] = intColor;
      }

      return function (x) {
        var y = colors[colors.length - 1];
        for (var i = 0; i < thresholds.length - 1; i++) {
          if (x <= thresholds[i]) {
            y = colors[i];
            break;
          }
        }
        return y;
      };
    };
  });
