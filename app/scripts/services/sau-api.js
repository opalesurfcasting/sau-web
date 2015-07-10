'use strict';

angular.module('sauWebApp')
  .factory('sauAPI', function ($resource, SAU_CONFIG) {

    var resourceFactory = function(apiPath) {
      return $resource(SAU_CONFIG.apiURL + apiPath,
        {},
        {get: {method: 'GET', cache: true}, post: {method: 'POST', cache: true}}
      );
    };

    var methods = {

      Region: resourceFactory(':region/:region_id'),
      Regions: resourceFactory(':region/'),
      IFA: resourceFactory('eez/:region_id/ifa/'),
      AccessAgreementInternal: resourceFactory('eez/:region_id/access-agreement-internal/'),
      CountryProfile: resourceFactory('country/:region_id'),
      Mariculture: resourceFactory('mariculture/:region_id'),
      MaricultureData: resourceFactory('mariculture/:dimension/:entity_id'),
      Data: resourceFactory(':region/:measure/:dimension/'),
      MarineTrophicIndexData: resourceFactory(':region/marine-trophic-index/'),
      StockStatusData: resourceFactory(':region/stock-status/'),
      EstuariesData: resourceFactory(':region/estuaries/'),
      MultinationalFootprintData: resourceFactory(':region/multinational-footprint/'),
      ExploitedOrganismsData: resourceFactory(':region/exploited-organisms/'),
      ExploitedOrganismsList: resourceFactory('exploited-organisms/'),
      EEZVsHighSeasData: resourceFactory('global/eez-vs-high-seas/'),
      Taxon: resourceFactory('taxa/:taxon_key'),
      TaxonLevels: resourceFactory('taxon-level/'),
      TaxonGroups: resourceFactory('taxon-group/'),
      GeoList: resourceFactory('geo-entity/'),
      Subsidies: resourceFactory('geo-entity/:geo_id/subsidies/'),
      SubsidyReference: resourceFactory('subsidy-reference/:id'),
      Expeditions: resourceFactory('expeditions/:subview/:id'),

      apiURL: SAU_CONFIG.apiURL
    };

    return methods;
  });
