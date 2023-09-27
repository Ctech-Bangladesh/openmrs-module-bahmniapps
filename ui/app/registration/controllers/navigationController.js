'use strict';

angular.module('bahmni.registration')
    .controller('NavigationController', ['$scope', '$rootScope', '$location', 'sessionService', '$window', 'appService', '$sce',
        function ($scope, $rootScope, $location, sessionService, $window, appService, $sce) {
            $scope.extensions = appService.getAppDescriptor().getExtensions("org.bahmni.registration.navigation", "link");
            $scope.goTo = function (url) {
                if ($window.localStorage.getItem('healthId') && url === '/patient/new') {
                    window.location.reload();
                    $window.localStorage.removeItem('healthId');
                } else {
                    $window.localStorage.removeItem('healthId');
                    $location.url(url);
                }
            };

            $scope.htmlLabel = function (label) {
                return $sce.trustAsHtml(label);
            };

            $scope.logout = function () {
                $rootScope.errorMessage = null;
                sessionService.destroy().then(
                    function () {
                        $window.location = "../home/";
                    }
                );
            };

            $scope.sync = function () {
            };
        }]);
