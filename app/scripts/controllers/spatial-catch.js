'use strict';
/* global d3 */
angular.module('sauWebApp').controller('SpatialCatchMapCtrl',
  function ($scope, fishingCountries, taxa, commercialGroups, functionalGroups, sauAPI, colorAssignment, $timeout, $location, $filter, $q, createQueryUrl, eezSpatialData, SAU_CONFIG, ga) {

    $scope.submitQuery = function (query) {
      $scope.lastQuery = angular.copy(query);
      assignColorsToComparees();
      updateUrlFromQuery();
      $scope.loadingText = 'Downloading cells';
      $scope.queryResponseErrorMessage = null;
      $scope.lastQuerySentence = getQuerySentence(query);
      $scope.catchGraphLinkText = getCatchGraphLinkText(query);
      $scope.catchGraphLink = getCatchGraphLink(query);
      $scope.queryResolved = false;

      //Form the query...
      var queryParams = {};
      var gaAction = ['query'];

      //...Fishing countries
      if (query.fishingCountries && query.fishingCountries.length > 0) {
        queryParams.entities = query.fishingCountries.join(',');
        
        //Form GA event action
        if (query.fishingCountries.length > 1) {
          gaAction.push(['multi-entity']);
        } else {
          gaAction.push(['single-entity']);
        }
      }

      //...Year
      if (query.year) {
        queryParams.year = query.year;
      }

      //..Number of buckets (color thresholds)
      if (query.bucketCount) {
        queryParams.buckets = query.bucketCount;
      }

      //Which type of bucketing function should we use
      if (query.bucketingMethod) {
        queryParams.buckmeth = query.bucketingMethod;
      }

      switch (query.catchesBy) {
        //...Taxa
        case 'taxa':
          if (query.taxa) {
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
          if (query.commercialGroups) {
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
          if (query.functionalGroups) {
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

      //...Compare term
      if (query.comparableType) {
        queryParams.compare = query.comparableType.compareTerm;
      }

      var promises = [];

      //Make the spatial catch call
      $scope.spatialCatchData = null;
      if ($scope.isAllocationQueryValid($scope.lastQuery)) {
        $scope.spatialCatchData = sauAPI.SpatialCatchData.get(queryParams);
        promises.push($scope.spatialCatchData.$promise);
      }

      //...Taxon distribution
      if ($scope.isDistributionQueryValid($scope.lastQuery)) {
        for (var i = 0; i < query.taxonDistribution.length; i++) {
          var taxonId = query.taxonDistribution[i];
          var taxonDistributionPromise = sauAPI.TaxonDistribution.get({id: taxonId});
          promises.push(taxonDistributionPromise);
        }
      }

      $q.all(promises).then(handleQueryResponse);

      //Google Analytics Event
      ga.sendEvent({
        category: 'Mapped Catch',
        action: gaAction.join(' '),
        label: $location.url()
      });
    };

    $scope.isQueryDirty = function() {
      return !angular.equals($scope.lastQuery, $scope.query);
    };

    $scope.getComparees = function(query) {
      var comparees = [];
      if ($scope.isQueryComparable(query)) {
        comparees = query[query.comparableType.field];
      }

      return comparees;
    };

    $scope.isQueryComparable = function(query) {
      return query && query.comparableType && query.comparableType.field;
    };

    $scope.getAssignedColor = function (id) {
      return colorAssignment.colorOf(id);
    };

    $scope.isAllocationQueryValid = function(query) {
      var hasFishingCountryInput = query && query.fishingCountries && query.fishingCountries.length > 0;

      var hasCatchesByInput = false;
      switch ($scope.query.catchesBy) {
        case 'taxa':
          if (query.taxa && query.taxa.length > 0) {
            hasCatchesByInput = true;
          }
          break;
        case 'commercial groups':
          if (query.commercialGroups && query.commercialGroups.length > 0) {
            hasCatchesByInput = true;
          }
          break;
        case 'functional groups':
          if (query.functionalGroups && query.functionalGroups.length > 0) {
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
      return $scope.isAllocationQueryValid(query) || $scope.isDistributionQueryValid(query);
    };

    $scope.minCatch = function() {
      var val = 0;
      if ($scope.spatialCatchData.data) {
        val = $scope.spatialCatchData.data.min_catch.toExponential(1);
      }

      var strVal = ''+val;
      return strVal + ' t/km²';
    };

    $scope.maxCatch = function () {
      var val = 0;
      if ($scope.spatialCatchData.data) {
        val = $scope.spatialCatchData.data.max_catch.toExponential(1);
      }

      var strVal = ''+val;
      return strVal + ' t/km²';
    };

    $scope.totalCatch = function (comparee) {
      var val = 0;
      if ($scope.spatialCatchData.data && $scope.spatialCatchData.data.rollup) {
        for (var i = 0; i < $scope.spatialCatchData.data.rollup.length; i++) {
          var rollupKey = $scope.spatialCatchData.data.rollup[i].rollup_key;
          if (rollupKey === ''+comparee || rollupKey === '') {
            val = +$scope.spatialCatchData.data.rollup[i].total_catch.toPrecision(1);
            break;
          }
        }
      }

      var units = 'x 10³ t';
      return val + ' ' + units;
    };

    $scope.getCompareeName = function (comparee) {

      if ($scope.isQueryComparable($scope.lastQuery)) {
        var comparees = $scope[$scope.lastQuery.comparableType.field];
        for (var i = 0; i < comparees.length; i++) {
          if (''+comparees[i][$scope.lastQuery.comparableType.key] === ''+comparee) {
            return comparees[i][$scope.lastQuery.comparableType.entityName];
          }
        }
      }

      return 'Catches';
    };

    $scope.getCompareeLink = function (comparee) {

      //No link if the query is not comparable.
      if (!$scope.isQueryComparable($scope.lastQuery)) {
        return null;
      }

      //Generate a link for any comparable types that require links.
      if ($scope.lastQuery.comparableType.field === 'taxa') {
        return '#/taxa/' + comparee;
      } else if ($scope.lastQuery.comparableType.field === 'fishingCountries') {
        var countryId = $scope.getValueFromObjectArray(
          $scope.fishingCountries, //Array
          $scope.lastQuery.comparableType.key, //Object Key
          comparee, //Value of that key
          'country_id'); //The property of the object that we want the value of.
        return '#/country/' + countryId;
      }

      //Return no link if the provided comparee is not a type that requires a link.
      return null;
    };

    $scope.getValueFromObjectArray = function (array, Idkey, IdValue, property) {
      for (var i = 0; i < array.length; i++) {
        if (''+array[i][Idkey] === ''+IdValue) {
          return array[i][property];
        }
      }
      return null;
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

    //This is used to render the list items in the multi-select dropdowns for taxa.
    //It shows both the common and scientific names, scientific in italics.
    $scope.makeTaxaDropdownItem = function (item, escape) {
      return '<div>' + escape(item.common_name) + ' <span class="scientific-name">(' + escape(item.scientific_name) + ')</span></div>';
    };

    function handleQueryResponse(responses) {
      $scope.queryResolved = true;
      $scope.isRendering = true;
      $scope.loadingText = 'Rendering';
      var i, j, cell, color, whiteness;
      //The rendering process locks the CPU for a while, so the $timeout gives us a chance to
      //put up a loading screen.
      $timeout(function() {
        var cellData = new Uint8ClampedArray(1036800); //Number of bytes: columns * rows * 4 (r,g,b,a)

        //Color up the spatial catch data cells
        if ($scope.spatialCatchData === responses[0] && responses[0].data && responses[0].data.rollup) {
          $scope.bucketBoundaryLabels = createBucketBoundaryLabels($scope.spatialCatchData.data.bucket_boundaries);

          var groups = responses[0].data.rollup;
          for (i = 0; i < groups.length; i++) {
            var cellBlob = groups[i]; //Grouped cells
            color = colorAssignment.getDefaultColor();
            if ($scope.isQueryComparable($scope.lastQuery)) {
              color = colorAssignment.colorOf(cellBlob.rollup_key);
            }
            for (j = 0; j < cellBlob.data.length; j++) {
              var cellSubBlob = cellBlob.data[j]; //Subgroups by threshold
              whiteness = ($scope.lastQuery.bucketCount - cellSubBlob.threshold) / $scope.lastQuery.bucketCount;
              for (var k = 0; k < cellSubBlob.cells.length; k++) {
                cell = cellSubBlob.cells[k];
                colorCell(cellData, cell, color, whiteness);
              }
            }
          }
        }

        //Color up the taxon distribution cells.
        var taxonDistResponses = responses.slice(responses[0] === $scope.spatialCatchData ? 1 : 0);
        //Taxa distribution responses that have no data are noted in this array so that we can throw an error message to the user.
        var datalessTaxaNames = [];
        for (i = 0; i < taxonDistResponses.length; i++) {
          var taxonId = $scope.lastQuery.taxonDistribution[i];
          if (!taxonDistResponses[i].data || taxonDistResponses[i].data.byteLength === 0) {
            datalessTaxaNames.push($scope.getValueFromObjectArray($scope.taxa, 'taxon_key', taxonId, 'common_name'));
            continue;
          }
          var typedArray = new Uint32Array(taxonDistResponses[i].data);
          for (j=0; j < typedArray.length; j++) {
            var packed = typedArray[j];
            cell = packed & 0xfffff;
            var value = packed >>> 24;
            whiteness = (255 - value) / 255 * 0.8;
            color = colorAssignment.colorOf('#' + taxonId);
            colorCell(cellData, cell, color, whiteness);
          }
        }

        //Update an error message to the user.
        if (datalessTaxaNames.length > 0) {
          $scope.queryResponseErrorMessage = 'No distribution data currently exists for some taxa in your query (' + datalessTaxaNames.join(', ') + ').';
        }

        mapGridLayer.grid.data = cellData;
        map.draw();
      }, 50).then(function () {
        $scope.isRendering = false;
      });
    }

    function colorCell(cellData, cell, color, whiteness) {
      //Don't use a color blend mode for cell's the first color.
      if (cellData[cell*4 + 3] === 0) {
        cellData[cell*4] = lightenChannel(color[0], whiteness);
        cellData[cell*4 + 1] = lightenChannel(color[1], whiteness);
        cellData[cell*4 + 2] = lightenChannel(color[2], whiteness);
        cellData[cell*4 + 3] = 255;
      //Multiply the colors for layered cells.
      } else {
        cellData[cell*4] = multiplyChannel(lightenChannel(color[0], whiteness), cellData[cell*4]);
        cellData[cell*4 + 1] = multiplyChannel(lightenChannel(color[1], whiteness), cellData[cell*4 + 1]);
        cellData[cell*4 + 2] = multiplyChannel(lightenChannel(color[2], whiteness), cellData[cell*4 + 2]);
        cellData[cell*4 + 3] = 255;
      }
    }

    function multiplyChannel(top, bottom) {
      return ~~(top * bottom / 255);
    }

    function lightenChannel(color, pct) {
      return ~~((255 - color) * pct + color);
    }

    function updateComparableTypeList() {
      $scope.comparableTypes = [allComparableTypes[0]];

      //Add fishing countries to the comparable list if there is more than one selected.
      if ($scope.query.fishingCountries && $scope.query.fishingCountries.length > 1) {
        $scope.comparableTypes.push(allComparableTypes.getWhere('field', 'fishingCountries'));
      }

      //Add the visible "catches by" dimension to the comparable types list if there is more than one selected.
      switch ($scope.query.catchesBy) {
        case 'taxa':
          if ($scope.query.taxa && $scope.query.taxa.length > 1) {
            $scope.comparableTypes.push(allComparableTypes.getWhere('field', 'taxa'));
          }
          break;
        case 'commercial groups':
          if ($scope.query.commercialGroups && $scope.query.commercialGroups.length > 1) {
            $scope.comparableTypes.push(allComparableTypes.getWhere('field', 'commercialGroups'));
          }
          break;
        case 'functional groups':
          if ($scope.query.functionalGroups && $scope.query.functionalGroups.length > 1) {
            $scope.comparableTypes.push(allComparableTypes.getWhere('field', 'functionalGroups'));
          }
          break;
      }

      assignDefaultComparison();
    }

    function assignDefaultComparison() {
      if (!$scope.query.comparableType || $scope.comparableTypes.indexOf($scope.query.comparableType) === -1) {
        $scope.query.comparableType = allComparableTypes[0]; //This is the "None" comparable type.
      }
    }

    function assignColorsToComparees() {
      var i;
      var colorIds = [];
      //Assign colors to the members of the chosen comparable field.
      if ($scope.isQueryComparable($scope.lastQuery)) {
        var comparees = $scope.getComparees($scope.lastQuery);
        if (comparees) {
          for (i = 0; i < comparees.length; i++) {
            colorIds.push(''+comparees[i]);
          }
        }
      //For non-comparable queries, just make a default color ID.
      } else {
        colorIds.push('default');
      }

      //Assign colors to the various taxa in the taxon distribution.
      if ($scope.lastQuery.taxonDistribution) {
        for (i = 0; i < $scope.lastQuery.taxonDistribution.length; i++) {
          //Using a hash to avoid ID conflicts between taxon distribution and spatial catch distribution.
          colorIds.push('#' + $scope.lastQuery.taxonDistribution[i]);
        }
      }

      colorAssignment.setData(colorIds);
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

      //Year
      $scope.query.year = Math.min(Math.max(+search.year || 2010, 1950), 2010); //Clamp(year, 1950, 2010). Why does JS not have a clamp function?

      //Number of color thresholds
      if (search.buckets) {
        $scope.query.bucketCount = Math.min(+search.buckets, 10);
      } else {
        $scope.query.bucketCount = 10;
      }

      //Bucketing method
      if (search.buckmeth) {
        $scope.query.bucketingMethod = search.buckmeth;
      } else {
        $scope.query.bucketingMethod = 'ptile';
      }

      //Compare type (must supply one, no matter what)
      updateComparableTypeList();
      if (search.compare) {
        $scope.query.comparableType = allComparableTypes.getWhere('compareTerm', search.compare);
      } else {
        $scope.query.comparableType = allComparableTypes[0]; //The "None" comparable type.
      }

      //Taxon distribution
      if (search.dist) {
        $scope.query.taxonDistribution = search.dist.split(',');
      }
    }

    function updateUrlFromQuery() {
      //Fishing countries
      if ($scope.query.fishingCountries && $scope.query.fishingCountries.length > 0) {
        $location.search('entities', $scope.query.fishingCountries.join(','));
      } else {
        $location.search('entities', null);
      }

      var searchValue;
      //Taxa, commercial groups, functional groups
      switch ($scope.query.catchesBy) {
        case 'taxa':
          searchValue = ($scope.query.taxa && $scope.query.taxa.length > 0) ? $scope.query.taxa.join(',') : null;
          $location.search('taxa', searchValue);
          $location.search('commgroups', null);
          $location.search('funcgroups', null);
          break;
        case 'commercial groups':
          searchValue = ($scope.query.commercialGroups && $scope.query.commercialGroups.length > 0) ? $scope.query.commercialGroups.join(',') : null;
          $location.search('taxa', null);
          $location.search('commgroups', searchValue);
          $location.search('funcgroups', null);
          break;
        case 'functional groups':
          searchValue = ($scope.query.functionalGroups && $scope.query.functionalGroups.length > 0) ? $scope.query.functionalGroups.join(',') : null;
          $location.search('taxa', null);
          $location.search('commgroups', null);
          $location.search('funcgroups', searchValue);
          break;
      }

      //Year
      var queryYear = $scope.query.year || 2010;
      if (queryYear !== 2010) {
        $location.search('year', queryYear);
      } else {
        $location.search('year', null);
      }

      //Number of color thresholds
      if ($scope.query.bucketCount && $scope.query.bucketCount !== 10) {
        $location.search('buckets', $scope.query.bucketCount);
      } else {
        $location.search('buckets', null);
      }

      //Bucketing method
      if ($scope.query.bucketingMethod && $scope.query.bucketingMethod !== 'ptile') {
        $location.search('buckmeth', $scope.query.bucketingMethod);
      } else {
        $location.search('buckmeth', null);
      }

      //Compare type
      if ($scope.isQueryComparable($scope.lastQuery)) {
        $location.search('compare', $scope.query.comparableType.compareTerm);
      } else {
        $location.search('compare', null);
      }

      //Taxon distribution
      if ($scope.query.taxonDistribution && $scope.query.taxonDistribution.length > 0) {
        $location.search('dist', $scope.query.taxonDistribution.join(','));
      } else {
        $location.search('dist', null);
      }

      $location.replace();
    }

    function getQuerySentence (query) {
      //[All, Unreported, Reported, All] [fishing, landings, Discards, (F)fishing ] [<blank>, of Abolones, of 2 taxa, of 2 commercial groups] by the fleets of [Angola, 2 countries] in [year]

      if (!$scope.isQueryValid(query)) {
        return '';
      }

      var sentence = [];

      //A query is still valid if there are no fishing countries or taxa selected, if instead there are taxa distribution parameters set.
      //But then our typical sentence structure doesn't make any sense.
      if ((!query.fishingCountries || query.fishingCountries.length === 0) &&
        (query.taxonDistribution && query.taxonDistribution.length > 0)) {
        sentence.push('Global distribution of ');
        if (query.taxonDistribution.length === 1) {
          var taxonName = $scope.getValueFromObjectArray($scope.taxa, 'taxon_key', query.taxonDistribution[0], 'common_name');
          sentence.push(taxonName);
        } else {
          sentence.push(query.taxonDistribution.length + ' taxa');
        }
      } else {
        sentence.push('All fishing');

        //Catches by
        if (query.catchesBy === 'taxa') {
          if (query.taxa && query.taxa.length === 1) {
            var taxaName = $scope.getValueFromObjectArray($scope.taxa, 'taxon_key', query.taxa[0], 'common_name');
            sentence.push('of ' + taxaName.toLowerCase());
          } else if (query.taxa && query.taxa.length > 1) {
            sentence.push('of ' + query.taxa.length + ' taxa');
          }
        } else if (query.catchesBy === 'commercial groups') {
          if (query.commercialGroups && query.commercialGroups.length === 1) {
            var commercialGroupName = $scope.getValueFromObjectArray($scope.commercialGroups, 'commercial_group_id', query.commercialGroups[0], 'name');
            sentence.push('of ' + commercialGroupName.toLowerCase());
          } else if (query.commercialGroups && query.commercialGroups.length > 1) {
            sentence.push('of ' + query.commercialGroups.length + ' commercial groups');
          }
        } else if (query.catchesBy === 'functional groups') {
          if (query.functionalGroups && query.functionalGroups.length === 1) {
            var functionalGroupName = $scope.getValueFromObjectArray($scope.functionalGroups, 'functional_group_id', query.functionalGroups[0], 'description');
            sentence.push('of ' + functionalGroupName.toLowerCase());
          } else if (query.functionalGroups && query.functionalGroups.length > 1) {
            sentence.push('of ' + query.functionalGroups.length + ' functional groups');
          }
        }

        //Fishing countries
        if (query.fishingCountries && query.fishingCountries.length > 0) {
          if (query.fishingCountries.length === 1) {
            var countryName = $scope.getValueFromObjectArray($scope.fishingCountries, 'id', query.fishingCountries[0], 'title');
            sentence.push('by the fleets of ' + countryName);
          } else {
            sentence.push('by the fleets of ' + query.fishingCountries.length + ' countries');
          }
        }

        //Year
        sentence.push('in ' + (query.year || 2010));
      }

      return sentence.join(' ');
    }

    function getCatchGraphLinkText (query) {
      if (!query.fishingCountries || query.fishingCountries.length === 0) {
        return null;
      }

      var text = 'View graph of catches by ' + query.catchesBy + ' by the fleets of ';
      if (query.fishingCountries.length === 1) {
        text += $scope.getValueFromObjectArray($scope.fishingCountries, 'id', query.fishingCountries[0], 'title');
      } else {
        text += 'the selected countries';
      }

      return text + '.';
    }

    function getCatchGraphLink (query) {
      if (!query.fishingCountries || query.fishingCountries.length === 0) {
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

    function getBucketsOfCell(cellId) {
      if (!$scope.spatialCatchData || !$scope.spatialCatchData.data || !$scope.spatialCatchData.data.rollup) {
        return {};
      }
      var buckets = {}; //array of buckets by compareeId: buckets[compareeId] = 4;
      var groups = $scope.spatialCatchData.data.rollup;

      for (var i = 0; i < groups.length; i++) {
        var group = groups[i];
        var groupId = group.rollup_key || 'default';
        buckets[groupId] = [];
        for (var j = 0; j < group.data.length; j++) {
          var threshold = group.data[j];
          for (var k = 0; k < threshold.cells.length; k++) {
            var cell = threshold.cells[k];
            if (cell === cellId) {
              buckets[groupId] = threshold.threshold - 1;
            }
          }
        }
      }

      return buckets;
    }

    function createBucketBoundaryLabels (boundaries) {
      var boundaryLabels = new Array(boundaries.length - 1);

      for (var i = 0; i < boundaries.length - 1; i++) {
        //Each boundary label looks something like this: "8.3e-11 to 2.6e-3 t/km²"
        boundaryLabels[i] = boundaries[i].toExponential(1) + ' to ' + boundaries[i + 1].toExponential(1) + ' t/km²';
      }

      return boundaryLabels;
    }

    //Resolved service responses
    $scope.fishingCountries = fishingCountries.data;
    $scope.taxa = taxa.data;
    for (var i = 0; i < $scope.taxa.length; i++) {
      $scope.taxa[i].displayName = $scope.taxa[i].common_name + ' (' + $scope.taxa[i].scientific_name + ')';
    }
    $scope.commercialGroups = commercialGroups.data;
    $scope.functionalGroups = functionalGroups.data;
    $scope.defaultColor = colorAssignment.getDefaultColor();
    //The values are "bucket" or "threshold numbers", organized as a 2-dimensional array: highlightedCells[compareeId][]
    $scope.highlightedBuckets = {};
    //SAU_CONFIG.env = 'stage'; //Used to fake the staging environment.
    $scope.inProd = SAU_CONFIG.env === 'stage' || SAU_CONFIG.env === 'prod';

    $scope.$watch(
      [
        'query.catchesBy'
      ],
      updateComparableTypeList
    );
    $scope.$watchCollection('query.fishingCountries', updateComparableTypeList);
    $scope.$watchCollection('query.taxa', updateComparableTypeList);
    $scope.$watchCollection('query.commercialGroups', updateComparableTypeList);
    $scope.$watchCollection('query.functionalGroups', updateComparableTypeList);
    $scope.$on('$destroy', $scope.$on('$locationChangeSuccess', updateQueryFromUrl));
    $scope.query = {};

    var allComparableTypes = [
      {
        name: 'None'
      },
      {
        name: 'Fishing countries',
        field: 'fishingCountries',
        key: 'id',
        entityName: 'title',
        compareTerm: 'entities'
      },
      {
        name: 'Taxa',
        field: 'taxa',
        key: 'taxon_key',
        entityName: 'displayName',
        compareTerm: 'taxa'
      },
      {
        name: 'Commercial groups',
        field: 'commercialGroups',
        key: 'commercial_group_id',
        entityName: 'name',
        compareTerm: 'commgroups'
      },
      {
        name: 'Functional groups',
        field: 'functionalGroups',
        key: 'functional_group_id',
        entityName: 'description',
        compareTerm: 'funcgroups'
      }
    ];

    allComparableTypes.getWhere = function(field, value) {
      for (var i = 0; i < allComparableTypes.length; i++) {
        if (allComparableTypes[i][field] === value) {
          return allComparableTypes[i];
        }
      }
      return null;
    };

    var map;
    var mapGridLayer;
    d3.json('countries.topojson', function(error, countries) {
      map = new d3.geo.GridMap('#cell-map', {
        seaColor: 'rgba(181, 224, 249, 1)',
        graticuleColor: 'rgba(255, 255, 255, 0.3)',
        disableMouseZoom: true,
        onCellHover: function (cell, cellId) {
          $scope.highlightedBuckets = getBucketsOfCell(cellId);
          $scope.$apply();
        }
      });

      mapGridLayer = map.setData(new Uint8ClampedArray(720 * 360 * 4), {
        gridSize: [720, 360],
        renderOnAnimate: false
      });

      map.setData(eezSpatialData.data, {
        fillColor: 'rgba(0, 117, 187, 0)',
        strokeColor: 'rgba(0, 117, 187, 1)',
        renderOnAnimate: false
      });

      map.setData(countries, {
        fillColor: 'rgba(251, 250, 243, 1)',
        strokeColor: 'rgba(0, 0, 0, 0)'
      });
    });

    updateQueryFromUrl();

    //Boostrap the initial query if there are query params in the URL when the page loads.
    if ($scope.isQueryValid($scope.query)) {
      $scope.submitQuery($scope.query);
    }
  });