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
            const storedHospitalName = localStorage.getItem('hospitalName');
            if (storedHospitalName) {
                $scope.hospitalName = storedHospitalName;
            } else {
                const userHeaders = new Headers();
                userHeaders.append("Content-Type", "application/json");
                userHeaders.append("Authorization", "Basic YXBpLWFkbWluOkRldkBDcnlzdGFsMzIx");
                fetch(`https://${$window.location.hostname}/openmrs/ws/rest/v1/location?tags=Visit+Location&v=full`, {
                    method: "GET",
                    headers: userHeaders
                })
                    .then((response) => {
                        return response.json();
                    })
                    .then(res => {
                        var hospitalName = res.results[0].display;
                        $timeout(function () {
                            $scope.hospitalName = hospitalName;
                        });
                        localStorage.setItem('hospitalName', hospitalName);
                    })
                    .catch(error => {
                        console.error('Error fetching hospital data:', error);
                    });
            }

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
