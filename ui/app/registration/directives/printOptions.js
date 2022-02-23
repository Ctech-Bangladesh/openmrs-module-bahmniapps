'use strict';

angular.module('bahmni.registration')
    .directive('printOptions', ['$http', '$q', '$stateParams', '$rootScope', 'registrationCardPrinter', 'spinner', 'appService', '$filter',
        function ($http, $q, $stateParams, $rootScope, registrationCardPrinter, spinner, appService, $filter) {
            var controller = function ($scope) {
                var getAdmissionAccess = function () {
                    return $http.get(`/openmrs/ws/rest/v1/obs?patient=${$stateParams.patientUuid}&concept=Visit%20Type`, {
                        method: "GET",
                        withCredentials: true
                    });
                };
                $q.all([getAdmissionAccess()]).then(function (response) {
                    $scope.printOptionsForAdmission = response[0].data.results.length > 0 ? true : false;
                });
                $scope.printOptionsAdmission = appService.getAppDescriptor().getConfigValue("printOptions");
                $scope.defaultPrintAdmission = $scope.printOptionsAdmission && $scope.printOptionsAdmission[0];

                $scope.printOptions = appService.getAppDescriptor().getConfigValue("printOptions").filter(option => option.translationKey !== "IPD_ADMISSION_FORM_KEY");
                $scope.defaultPrint = $scope.printOptions && $scope.printOptions[0];
                var mapRegistrationObservations = function () {
                    var obs = {};
                    $scope.observations = $scope.observations || [];
                    var getValue = function (observation) {
                        obs[observation.concept.name] = obs[observation.concept.name] || [];
                        observation.value && obs[observation.concept.name].push(observation.value);
                        observation.groupMembers.forEach(getValue);
                    };

                    $scope.observations.forEach(getValue);
                    return obs;
                };

                $scope.print = function (option) {
                    return registrationCardPrinter.print(option.templateUrl, $scope.patient, mapRegistrationObservations(), $scope.encounterDateTime, $scope.observations);
                };

                $scope.buttonText = function (option, type) {
                    var printHtml = "";
                    var optionValue = option && $filter('titleTranslate')(option);
                    if (type) {
                        printHtml = '<i class="fa fa-print"></i>';
                    }
                    return '<span>' + optionValue + '</span>' + printHtml;
                };
            };

            return {
                restrict: 'A',
                templateUrl: 'views/printOptions.html',
                controller: controller
            };
        }]);
