'use strict';

angular.module('bahmni.registration')
    .directive('printOptions', ['$rootScope', '$http', 'registrationCardPrinter', 'spinner', 'appService', '$filter',
        function ($rootScope, $http, registrationCardPrinter, spinner, appService, $filter) {
            var controller = function ($scope) {
                $scope.printOptions = appService.getAppDescriptor().getConfigValue("printOptions");
                // let queueMng = appService.getAppDescriptor().getConfigValue("queueManagement");
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
                    // if (queueMng.willUse === true) {
                    //     let identifier = $scope.patient.primaryIdentifier.identifier;
                    //     let date = new Date();
                    //     let formatDate = date.toISOString().split("T");
                    //     $http({
                    //         method: "GET",
                    //         url: "/openmrs/module/queuemanagement/getToken.form?identifier="
                    //             + identifier + "&dateCreated=" + formatDate[0]
                    //     }).then(function mySuccess(response) {
                    //         var newData = response.data.token;
                    //         $scope.serial.push(newData);
                    //     });
                    // } else {
                    //     console.log("Queue management is not started");
                    // }
                    $scope.observations.forEach(getValue);
                    return obs;
                };

                $scope.print = function (option) {
                    return registrationCardPrinter.print(option.templateUrl, $scope.patient, mapRegistrationObservations(), $scope.encounterDateTime, $scope.observations, $scope.serial);
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
