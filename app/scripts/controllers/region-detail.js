'use strict';

angular.module('sauWebApp').controller('RegionDetailCtrl',
  function ($scope, $modalInstance, $location, $window, sauService, region_id) {

    $scope.region_id = region_id;

    $scope.dimensions = [
      {label: 'Taxon', value: 'taxon'},
      {label: 'Commercial Group', value: 'commercialgroup'},
      {label: 'Functional Group', value: 'functionalgroup'},
      {label: 'Country', value: 'country'},
      // {label: 'Gear', value: 'gear'},
      {label: 'Sector', value: 'sector'},
      {label: 'Catch Type', value: 'catchtype'},
    ];

    $scope.measures = {
      'tonnage': {label: 'Tonnage', value: 'tonnage'},
      'value': {label: 'Value', value: 'value'}
    };

    $scope.limits = [
      {label: '20', value: '20'},
      {label: '10', value: '10'},
      {label: '5', value: '5'},
      {label: '1', value: '1'},
    ];

    $scope.formModel = {
      dimension: $scope.dimensions[0],
      measure: $scope.measures.tonnage,
      limit : $scope.limits[1]
    };

    $scope.feature = sauService.Region.get({region: $scope.region, region_id: region_id});

    $scope.close = function () {
      $modalInstance.close($scope.feature);
      $location.path('/'+$scope.region, false);
    };

    $scope.download = function() {
      // FIXME: constructing url manually, I don't know how to get it out of the $resource
      // This should probably be in a service or something too.
      var url = ['',
        sauService.api_url,
        $scope.region,
        '/',
        $scope.measure.value,
        '/',
        $scope.dimension.value,
        '/?format=csv&limit=',
        $scope.limit.value,
        '&region_id=',
        region_id,
      ].join('');
      $window.open(url, '_blank');
    };

    $scope.updateData = function() {
      var data_options = {region: $scope.region, region_id: region_id};
      data_options.dimension = $scope.formModel.dimension.value;
      data_options.measure = $scope.formModel.measure.value;
      data_options.limit = $scope.formModel.limit.value;
      var data = sauService.Data.get(data_options, function() {
         $scope.data = data.data;
       });
    };

    $scope.clickFormLink = function(dim, measure) {
      $scope.formModel.dimension = dim;
      $scope.formModel.measure = $scope.measures[measure];
    };

    $scope.$watch('formModel', $scope.updateData, true);

});