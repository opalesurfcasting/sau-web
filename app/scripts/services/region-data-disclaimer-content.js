'use strict';

angular.module('sauWebApp')
  .factory('regionDataDisclaimerContent', function() {
    var disclaimers = {
      global: 'NOTE: the data we present (\'reconstructed data\') combine official reported data and ' +
      'reconstructed estimates of unreported data (including major discards), with reference to ' +
      'individual EEZs. Official reported data are <a popover-html="National data are used for some countries.">' +
      'mainly</a> extracted from the Food and Agriculture Organization of the United Nations (FAO) ' +
      '<a href="http://www.fao.org/fishery/statistics/en" target="_blank">FishStat database</a>. For background ' +
      'information on reconstruction data used, please see the documentation associated with the individual EEZs.'
    };

    return {
      getDisclaimer: function(region) {
        return disclaimers[region] || '';
      }
    };
  });