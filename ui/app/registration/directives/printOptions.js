'use strict';

angular.module('bahmni.registration')
    .directive('printOptions', ['$http', '$q', '$stateParams', '$rootScope', 'registrationCardPrinter', 'spinner', 'appService', '$filter',
        function ($http, $q, $stateParams, $rootScope, registrationCardPrinter, spinner, appService, $filter) {
            var controller = function ($scope) {
                $scope.printOptionsAdmission = appService.getAppDescriptor().getConfigValue("printOptions");
                $scope.defaultPrintAdmission = $scope.printOptionsAdmission && $scope.printOptionsAdmission[0];
                $scope.printOptions = appService.getAppDescriptor().getConfigValue("printOptions").filter(option => option.shortcutKey !== "i");
                $scope.queueMng = appService.getAppDescriptor().getConfigValue("queueManagement");
                $scope.defaultPrint = $scope.printOptions && $scope.printOptions[0];

                var mapRegistrationObservations = function () {
                    var obs = {};
                    $scope.observations = $scope.observations || [];
                    $scope.serial = $scope.serial || [];
                    var getValue = function (observation) {
                        obs[observation.concept.name] = obs[observation.concept.name] || [];
                        observation.value && obs[observation.concept.name].push(observation.value);
                        observation.groupMembers.forEach(getValue);
                    };
                    if ($scope.queueMng.willUse === true) {
                        let identifier = $scope.patient.primaryIdentifier.identifier;
                        let date = new Date();
                        let formatDate = date.toISOString().split("T");
                        $http({
                            method: "GET",
                            url: "/openmrs/module/queuemanagement/getToken.form?identifier="
                                + identifier + "&dateCreated=" + formatDate[0]
                        }).then(function mySuccess (response) {
                            var newData = response.data.token;
                            $scope.serial.push(newData);
                        });
                    } else {
                        console.log("Queue management is not started");
                    }
                    $scope.observations.forEach(getValue);
                    var getDispositionNote = function () {
                        return $http.get(`/openmrs/ws/rest/v1/obs?concepts=Disposition%20Note&patient=${$stateParams.patientUuid}`, {
                            method: "GET",
                            withCredentials: true
                        });
                    };
                    $q.all([getDispositionNote()]).then(function (response) {
                        $scope.observations.dispositionNote = response[0].data.results[0];
                    });
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
