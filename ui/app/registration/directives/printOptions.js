'use strict';

angular.module('bahmni.registration')
    .directive('printOptions', ['$http', '$q', '$cookies', '$stateParams', '$rootScope', 'registrationCardPrinter', 'spinner', 'appService', '$filter',
        function ($http, $q, $cookies, $stateParams, $rootScope, registrationCardPrinter, spinner, appService, $filter) {
            var controller = function ($scope) {
                $scope.printOptionsAdmission = appService.getAppDescriptor().getConfigValue("printOptions").filter(option => option.shortcutKey !== "r");
                $scope.defaultPrintAdmission = $scope.printOptionsAdmission && $scope.printOptionsAdmission[0];
                $scope.printOptions = appService.getAppDescriptor().getConfigValue("printOptions").filter(option => option.shortcutKey !== "i" && option.shortcutKey !== "r");
                $scope.queueMng = appService.getAppDescriptor().getConfigValue("queueManagement");
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
                    if ($scope.queueMng.willUse === true) {
                        let identifier = $scope.patient.primaryIdentifier.identifier;
                        let date = new Date();
                        let formatDate = date.toISOString().split("T");
                        var getSerial = function () {
                            return $http.get(`/openmrs/module/queuemanagement/getToken.form?identifier=${identifier}&dateCreated=${formatDate[0]}`, {
                                method: "GET",
                                withCredentials: true
                            });
                        };
                        $q.all([getSerial()]).then(function (response) {
                            $scope.observations.serial = response[0].data.token;
                        });
                    } else {
                        console.log("Queue management is not started");
                    }

                    $scope.observations.forEach(getValue);
                    let filterWithoutRoom = $scope.observations.filter(data => data.conceptNameToDisplay !== 'Opd Consultation Room');
                    let filterRoom = $scope.observations.filter(data => data.conceptNameToDisplay === 'Opd Consultation Room');
                    let filterEmergency = filterRoom.filter(data => data.formFieldPath.includes('Emergency'));
                    let filterWithoutEmergency = filterRoom.filter(data => !data.formFieldPath.includes('Emergency'));
                    var value = $cookies.get("bahmni.user.location");
                    if (JSON.parse(value).name.toLowerCase().includes('emergency')) {
                        $scope.observations = [...filterWithoutRoom, ...filterEmergency];
                        $scope.observations.room = 'emergency';
                    }
                    else {
                        $scope.observations = [...filterWithoutRoom, ...filterWithoutEmergency];
                        $scope.observations.room = 'opd';
                    }

                    var getDispositionProvider = function () {
                        return $http.get(`/openmrs/ws/rest/v1/obs?limit=1&concepts=Disposition&patient=${$stateParams.patientUuid}`, {
                            method: "GET",
                            withCredentials: true
                        });
                    };
                    var getTemporaryCategoryNotes = function () {
                        return $http.get(`/openmrs/ws/rest/v1/obs?patient=${$stateParams.patientUuid}&concept=Temporary%20Category`, {
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
                    var user = $cookies.get("bahmni.user");
                    var getUser = function (data) {
                        return $http.get(`/openmrs/ws/rest/v1/user?username=${data}`, {
                            method: "GET",
                            withCredentials: true
                        });
                    };
                    $q.all([getUser(JSON.parse(user))]).then(function (response) {
                        if (response[0].data.results.length > 0) {
                            $q.all([getApiData(response[0].data.results[0].links[0].uri.split('/openmrs')[1])]).then(function (response) {
                                $scope.observations.user = response[0].data.person.display;
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
                    var getAge = function (dateString) {
                        var today = new Date();
                        var birthDate = new Date(dateString);
                        let by = Number.parseFloat(birthDate.getFullYear()),
                            bm = Number.parseFloat(birthDate.getMonth()),
                            bd = Number.parseFloat(birthDate.getDate()),
                            ty = Number.parseFloat(today.getFullYear()),
                            tm = Number.parseFloat(today.getMonth()),
                            td = Number.parseFloat(today.getDate());
                        let years = 0, months = 0, days = 0;
                        if (td < bd) {
                            tm = tm - 1;
                            if (tm < 0) {
                                ty = ty - 1;
                                tm = 11;
                            }
                            td = td + new Date(ty, tm + 1, 0).getDate();
                        }
                        if (tm < bm) {
                            ty = ty - 1;
                            tm = tm + 12;
                        }
                        years = ty - by;
                        months = tm - bm;
                        days = td - bd;
                        if (months < 0) {
                            years = years - 1;
                            months = months + 12;
                        }
                        let result = '';
                        if (years > 0) {
                            result += years + ' Y ';
                        }
                        else {
                            if (months > 0) {
                                result += months + ' M ';
                            }
                            if (days > 0) {
                                result += days + ' D';
                            }
                        }

                        return result;
                    };
                    var getUserRelationship = function (id) {
                        return $http.get(`/openmrs/ws/rest/v1/patientprofile/${id}?v=full`, {
                            method: "GET",
                            withCredentials: true
                        });
                    };
                    $q.all([getUserRelationship($stateParams.patientUuid)]).then(function (response) {
                        if (response[0].data.relationships.length > 0) {
                            if (response[0].data.relationships[0].personA.uuid === $stateParams.patientUuid) {
                                $scope.observations.relationship = true;
                                $scope.observations.relationshipStatus = response[0].data.relationships[0].display;
                                $q.all([getUserRelationship(response[0].data.relationships[0].personB.uuid)]).then(function (response) {
                                    if (response[0].data) {
                                        $scope.observations.mainPatient = response[0].data;
                                        $scope.observations.mainPatientAge = getAge(response[0].data.patient.person.birthdate);
                                        if (response[0].data.patient.person.attributes.length > 0) {
                                            let attributes = response[0].data.patient.person.attributes;
                                            let nid = attributes.filter(data => data.attributeType.display === "nationalId");
                                            if (nid.length > 0) {
                                                $scope.observations.mainPatientNid = nid[0].value;
                                            }
                                            let phoneNumber = attributes.filter(data => data.attributeType.display === "phoneNumber");
                                            if (phoneNumber.length > 0) {
                                                $scope.observations.mainPatientPhoneNumber = phoneNumber[0].value;
                                            }
                                        }
                                    }
                                });
                            }
                            else {
                                $scope.observations.relationship = false;
                            }
                        } else {
                            $scope.observations.relationship = false;
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
