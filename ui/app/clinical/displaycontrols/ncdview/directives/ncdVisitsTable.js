'use strict';

angular.module('bahmni.clinical')
    .directive('ncdVisitTable', ['patientVisitHistoryService', 'conceptSetService', '$state', '$q', '$http', '$window', 'spinner',
        function (patientVisitHistoryService, conceptSetService, $state, $q, $http, $window, spinner) {
            var controller = function ($scope) {
                var hostName = $window.location.hostname;
                var baseUrl = "https://" + hostName + "/openmrs/ws/rest/v1/uhcncd";
                $scope.getNcdVisits = function (patientUuid) {
                    var deferred = $q.defer();
                    $scope.ncdVisits = [];
                    $http({
                        method: 'GET',
                        url: baseUrl + '/patient/getPatientVisitNcdGroupBy.htm?patientId=0&patientUuid=' + patientUuid
                    }).then(function (response) {
                        $scope.ncdVisits = response.data.content;
                        deferred.resolve();
                    }).catch(function () {
                        deferred.reject();
                    });
                    return deferred.promise;
                };
                
                var emitNoDataPresentEvent = function () {
                    $scope.$emit("no-data-present-event");
                };
                $scope.hasVisits = function () {
                    return $scope.ncdVisits && $scope.ncdVisits.length > 0;
                };
                $scope.params = angular.extend(
                    {
                        maximumNoOfVisits: 4,
                        title: "Visits"
                    }, $scope.params);
                $scope.noVisitsMessage = "No NCD Visits for this patient.";               
                $scope.toggle = function (visit) {
                    visit.isOpen = !visit.isOpen;
                    visit.cacheOpenedHtml = true;
                };
                $scope.getDisplayName = function (data) {
                    var concept = data.concept;
                    var displayName = data.concept.displayString;
                    if (concept.names && concept.names.length === 1 && concept.names[0].name !== "") {
                        displayName = concept.names[0].name;
                    } else if (concept.names && concept.names.length === 2) {
                        displayName = _.find(concept.names, {conceptNameType: "SHORT"}).name;
                    }
                    return displayName;
                };               
                var init = function () {
                    return $scope.getNcdVisits($scope.patientUuid);
                };
                $scope.initialization = init();
                $scope.params = angular.extend(
                    {
                        maximumNoOfVisits: 4,
                        title: "Visits"
                    }, $scope.params);
                $scope.noVisitsMessage = "No Visits for this patient.";
            };
            var link = function ($scope, element) {
                spinner.forPromise($scope.initialization, element);
            };
            return {
                restrict: 'E',
                link: link,
                controller: controller,
                templateUrl: "displaycontrols/ncdview/views/ncdVisitsTable.html",
                scope: {
                    params: "=",
                    patientUuid: "="
                }
            };
        }]);
