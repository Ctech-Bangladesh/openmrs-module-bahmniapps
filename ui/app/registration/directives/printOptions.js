'use strict';

angular.module('bahmni.registration')
    .directive('printOptions', ['$http', '$q', '$cookies', '$stateParams', '$rootScope', 'registrationCardPrinter', 'spinner', 'appService', '$filter',
        function ($http, $q, $cookies, $stateParams, $rootScope, registrationCardPrinter, spinner, appService, $filter) {
            var controller = function ($scope) {
                $scope.printOptionsAdmission = appService.getAppDescriptor().getConfigValue("printOptions").filter(option => option.shortcutKey !== "r");
                $scope.defaultPrintAdmission = $scope.printOptionsAdmission && $scope.printOptionsAdmission[0];
                $scope.printOptions = appService.getAppDescriptor().getConfigValue("printOptions").filter(option => option.shortcutKey !== "i" && option.shortcutKey !== "r");
                $scope.defaultPrint = $scope.printOptions && $scope.printOptions[0];

                $scope.printOptionsAdmissionForDev = appService.getAppDescriptor().getConfigValue("printOptions");
                $scope.defaultPrintAdmissionForDev = $scope.printOptionsAdmissionForDev && $scope.printOptionsAdmissionForDev[0];
                $scope.printOptionsForDev = appService.getAppDescriptor().getConfigValue("printOptions").filter(option => option.shortcutKey !== "i");
                $scope.defaultPrintForDev = $scope.printOptionsForDev && $scope.printOptionsForDev[0];
                var mapRegistrationObservations = function () {
                    var obs = {};
                    $scope.observations = $scope.observations || [];
                    var getValue = function (observation) {
                        obs[observation.concept.name] = obs[observation.concept.name] || [];
                        observation.value && obs[observation.concept.name].push(observation.value);
                        observation.groupMembers.forEach(getValue);
                    };
                    $scope.observations.forEach(getValue);
                    let filterWithoutRoom = $scope.observations.filter(data => data.conceptNameToDisplay !== 'Opd Consultation Room');
                    let filterRoom = $scope.observations.filter(data => data.conceptNameToDisplay === 'Opd Consultation Room');
                    let filterEmergency = filterRoom.filter(data => data.formFieldPath.includes('Emergency'));
                    let filterWithoutEmergency = filterRoom.filter(data => !data.formFieldPath.includes('Emergency'));
                    var value = $cookies.get("bahmni.user.location");
                    if (JSON.parse(value).name === "Emergency") {
                        $scope.observations = [...filterWithoutRoom, ...filterEmergency];
                    }
                    else {
                        $scope.observations = [...filterWithoutRoom, ...filterWithoutEmergency];
                    }
                    // let visitUUid = sessionStorage.getItem('visitUUid');
                    // var getMedicine = function () {
                    //     return $http.get(`/openmrs/ws/rest/v1/bahmnicore/drugOrders/prescribedAndActive?getOtherActive=false&patientUuid=${$stateParams.patientUuid}&visitUuids=${visitUUid}`, {
                    //         method: "GET",
                    //         withCredentials: true
                    //     });
                    // };

                    // $q.all([getMedicine()]).then(function (response) {
                    //     if (response[0].data.visitDrugOrders.length) {
                    //         const drugs = response[0].data.visitDrugOrders.filter(drug => drug.dateStopped === null);
                    //         $scope.observations.activeDrug = drugs;
                    //     }
                    // });
                    var getTemporaryCategoryNotes = function () {
                        return $http.get(`/openmrs/ws/rest/v1/obs?patient=${$stateParams.patientUuid}&concept=Temporary%20Category`, {
                            method: "GET",
                            withCredentials: true
                        });
                    };
                    var getDispositionProvider = function () {
                        return $http.get(`/openmrs/ws/rest/v1/obs?limit=1&concepts=Disposition&patient=${$stateParams.patientUuid}`, {
                            method: "GET",
                            withCredentials: true
                        });
                    };
                    var getProviderDesignation = function (providerUuid) {
                        var params = {
                            q: "bahmni.sqlGet.providerDesignation2",
                            v: "full",
                            providerUuid: providerUuid
                        };
                        return $http.get('/openmrs/ws/rest/v1/bahmnicore/sql', {
                            method: "GET",
                            params: params,
                            withCredentials: true
                        });
                    };
                    var getApiData = function (url) {
                        return $http.get(`/openmrs${url}`, {
                            method: "GET",
                            withCredentials: true
                        });
                    };
                    $q.all([getTemporaryCategoryNotes()]).then(function (response) {
                        if (response[0].data.results.length > 0) {
                            $q.all([getApiData(response[0].data.results[0].links[0].uri.split('/openmrs')[1])]).then(function (response) {
                                $scope.observations.temporaryCategoryNotes = response[0].data.comment;
                            });
                        }
                    });
                    $q.all([getDispositionProvider()]).then(function (response) {
                        if (response[0].data.results.length > 0) {
                            $q.all([getApiData(response[0].data.results[0].links[0].uri.split('/openmrs')[1])]).then(function (response) {
                                $q.all([getApiData(response[0].data.encounter.links[0].uri.split('/openmrs')[1])]).then(function (response) {
                                    $q.all([getApiData(response[0].data.encounterProviders[0].links[0].uri.split('/openmrs')[1])]).then(function (response) {
                                        $q.all([getApiData(response[0].data.provider.links[0].uri.split('/openmrs')[1])]).then(function (response) {
                                            $scope.observations.providerName = response[0].data.person.display;
                                        });
                                        $q.all([getProviderDesignation(response[0].data.provider.uuid)]).then(function (response) {
                                            if (response[0].data.length > 0) {
                                                for (var i = 0; i < response[0].data.length; i++) {
                                                    if (response[0].data[i].name == 'Designation') {
                                                        $scope.observations.providerDesignation = response[0].data[i].value_reference;
                                                    }
                                                }
                                            }
                                        });
                                    });
                                });
                            });
                        }
                    });
                    var getDispositionNote = function () {
                        return $http.get(`/openmrs/ws/rest/v1/obs?limit=1&patient=${$stateParams.patientUuid}&concept=Disposition%20Set`, {
                            method: "GET",
                            withCredentials: true
                        });
                    };
                    $q.all([getDispositionNote()]).then(function (response) {
                        if (response[0].data.results.length > 0) {
                            $q.all([getApiData(response[0].data.results[0].links[0].uri.split('/openmrs')[1])]).then(function (response) {
                                $scope.observations.dispositionSet = response[0].data.groupMembers.filter(data => data.concept.display === 'Disposition');
                                $scope.observations.dispositionNote = response[0].data.groupMembers.filter(data => data.concept.display === 'Disposition Note');
                            });
                        }
                    });
                    var getRoomData = function (url) {
                        return $http.get(`/openmrs${url}`, {
                            method: "GET",
                            withCredentials: true
                        });
                    };
                    var getRoom = function () {
                        return $http.get(`/openmrs/ws/rest/v1/obs?limit=2&concepts=Opd%20Consultation%20Room&patient=${$stateParams.patientUuid}`, {
                            method: "GET",
                            withCredentials: true
                        });
                    };
                    $q.all([getRoom()]).then(function (response) {
                        if (response[0].data.results.length === 1) {
                            $scope.observations.previousDate = $scope.observations[1].encounterDateTime;
                        }
                        else if (response[0].data.results.length > 1) {
                            $q.all([getRoomData(response[0].data.results[1].links[0].uri.split('/openmrs')[1])]).then(function (response) {
                                $scope.observations.previousDate = response[0].data.obsDatetime;
                            });
                        }
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
