'use strict';

angular.module('bahmni.home')
    .controller('DashboardController', ['$scope', '$timeout', '$cookies', '$http', '$state', 'appService', 'locationService', 'spinner', '$bahmniCookieStore', '$window', '$q',
        function ($scope, $timeout, $cookies, $http, $state, appService, locationService, spinner, $bahmniCookieStore, $window, $q) {
            $scope.appExtensions = appService.getAppDescriptor().getExtensions($state.current.data.extensionPointId, "link") || [];
            $scope.selectedLocationUuid = {};

            var isOnline = function () {
                return $window.navigator.onLine;
            };
            var user = $cookies.get("bahmni.user");
            var getUser = function (data) {
                return $http.get(`/openmrs/ws/rest/v1/user?username=${data}&v=custom:(username,uuid,person:(uuid,),privileges:(name,retired),userProperties)`, {
                    method: "GET",
                    withCredentials: true
                });
            };
            const storedHospitalName = localStorage.getItem('hospitalName');
            if (storedHospitalName) {
                $scope.hospitalName = storedHospitalName;
            } else {
                fetch(`/openmrs/module/queuemanagement/hospitalData.form`)
                    .then((response) => {
                        return response.text();
                    })
                    .then(res => {
                        $timeout(function () {
                            $scope.hospitalName = res;
                        });
                        localStorage.setItem('hospitalName', res);
                    })
                    .catch(error => {
                        console.error('Error fetching hospital data:', error);
                    });
            }
            $q.all([getUser(JSON.parse(user))]).then(function (response) {
                // const createBahmniHRIS = createBahmniHRISUser(bahmniUserPayload);
                if (response[0].data.results.length > 0) {
                    const userData = response[0].data.results[0];
                    fetch(`https://${$window.location.hostname}:6062/api/v1/hris-user/${userData.person.uuid}`)
                        .then((response) => {
                            return response.json();
                        })
                        .then(res => {
                            if (res?.content?.object) {
                                const userProviderData = JSON.parse(res.content.object);
                                $timeout(function () {
                                    $scope.providerFacility = userProviderData.organization.display;
                                });
                                localStorage.setItem('providerFacility', userProviderData.organization.display);
                            } else {
                                localStorage.removeItem('providerFacility');
                            }

                        });
                }
            });
            $scope.providerName = localStorage.getItem('providerName');
            // $scope.providerFacility = localStorage.getItem('providerFacility');
            const healthIDEnable = appService.getAppDescriptor().getConfigValue("healthIDEnable");
            $scope.isVisibleExtension = function (extension) {
                if (extension.id === "bahmni.registration" && healthIDEnable) {
                    extension.url = `https://${$window.location.hostname}:6062/health-id/`;
                }
                return extension.exclusiveOnlineModule ? isOnline() : extension.exclusiveOfflineModule ? !isOnline() : true;
            };

            var getCurrentLocation = function () {
                return $bahmniCookieStore.get(Bahmni.Common.Constants.locationCookieName) ? $bahmniCookieStore.get(Bahmni.Common.Constants.locationCookieName) : null;
            };

            var init = function () {
                return locationService.getAllByTag("Login Location").then(function (response) {
                    $scope.locations = response.data.results;
                    $scope.selectedLocationUuid = getCurrentLocation().uuid;
                }
                );
            };

            var getLocationFor = function (uuid) {
                return _.find($scope.locations, function (location) {
                    return location.uuid === uuid;
                });
            };

            $scope.isCurrentLocation = function (location) {
                return getCurrentLocation().uuid === location.uuid;
            };

            $scope.onLocationChange = function () {
                var selectedLocation = getLocationFor($scope.selectedLocationUuid);
                $bahmniCookieStore.remove(Bahmni.Common.Constants.locationCookieName);
                $bahmniCookieStore.put(Bahmni.Common.Constants.locationCookieName, {
                    name: selectedLocation.display,
                    uuid: selectedLocation.uuid
                }, { path: '/', expires: 7 });
                $window.location.reload();
            };

            $scope.changePassword = function () {
                $state.go('changePassword');
            };

            return spinner.forPromise($q.all(init()));
        }]);
