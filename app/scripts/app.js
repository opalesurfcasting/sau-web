'use strict';

/**
 * @ngdoc overview
 * @name sauWebApp
 * @description
 * # sauWebApp
 *
 * Main module of the application.
 */
angular
  .module('sauWebApp', [
    'ngAnimate',
    'ngCookies',
    'ngResource',
    'ngRoute',
    'ngSanitize',
    'ngTouch',
    'leaflet-directive'
  ])
  .config(function ($routeProvider) {
    $routeProvider
      .when('/', {
        templateUrl: 'views/main.html',
        controller: 'MainCtrl'
      })
      .when('/eez', {
        templateUrl: 'views/map.html',
        controller: 'MapCtrl',
      })
      .when('/lme', {
        templateUrl: 'views/map.html',
        controller: 'MapCtrl',
      })
      .when('/rfmo', {
        templateUrl: 'views/map.html',
        controller: 'MapCtrl',
      })
      .when('/fao', {
        templateUrl: 'views/map.html',
        controller: 'MapCtrl'
      })
      .when('/global', {
        templateUrl: 'views/map.html',
        controller: 'MapCtrl'
      })

      .otherwise({
        redirectTo: '/'
      });
  });
