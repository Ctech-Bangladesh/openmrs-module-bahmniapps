'use strict';

angular.module('bahmni.registration')
    .controller('EditPatientController', ['$scope', '$timeout', '$cookies', '$http', 'patientService', 'encounterService', '$stateParams', 'openmrsPatientMapper',
        '$window', '$q', 'spinner', 'appService', 'messagingService', '$rootScope', 'auditLogService', 'registrationCardPrinter',
        function ($scope, $timeout, $cookies, $http, patientService, encounterService, $stateParams, openmrsPatientMapper, $window, $q, spinner,
            appService, messagingService, $rootScope, auditLogService, registrationCardPrinter) {
            var dateUtil = Bahmni.Common.Util.DateUtil;
            var uuid = $stateParams.patientUuid;
            $scope.patient = {};
            var getUserRole = function () {
                var params = {
                    v: "full"
                };
                return $http.get('/openmrs/ws/rest/v1/user?limit=500', {
                    method: "GET",
                    params: params,
                    withCredentials: true
                });
            };
            $q.all([getUserRole()]).then(function (response) {
                var result = response[0].data.results;
                var providerUuid = $rootScope.currentUser.person.uuid;
                var filterUser = result.filter(user =>
                    user.person.uuid === providerUuid
                );
                var roles = filterUser[0].roles;
                var verify = roles.filter(role => role.name === "System Developer");

                if (verify.length === 0) {
                    var refresh = $window.localStorage.getItem('refresh');
                    if (refresh === null) {
                        location.reload();
                        $window.localStorage.setItem('refresh', "1");
                    }
                    $scope.patient.access = true;
                } else {
                    if (appService.getAppDescriptor().getConfigValue("reprint") !== null) {
                        $scope.showReprint = appService.getAppDescriptor().getConfigValue("reprint").value;
                    }
                    if (appService.getAppDescriptor().getConfigValue("rePrintIpdAdmission") !== null) {
                        $scope.showReprintIPD = appService.getAppDescriptor().getConfigValue("rePrintIpdAdmission").value;
                    }
                    $scope.patient.access = false;
                }
            });
            $scope.actions = {};
            $scope.addressHierarchyConfigs = appService.getAppDescriptor().getConfigValue("addressHierarchy");
            $scope.disablePhotoCapture = appService.getAppDescriptor().getConfigValue("disablePhotoCapture");

            $scope.today = dateUtil.getDateWithoutTime(dateUtil.now());
            $scope.allowRePrint = false;

            $timeout(function () {
                let apiURL = "/openmrs/ws/rest/v1/bahmnicore/observations?" +
                    "concept=Visit+Details&concept=Free+Type&" +
                    "concept=Temporary+Category&concept=Opd+Consultation+Room&" +
                    "patientUuid=" +
                    uuid +
                    "&scope=latest";
                $http({
                    method: "GET",
                    url: apiURL
                }).then(function mySuccess (response) {
                    let obsData = response.data;
                    $scope.obsData = obsData;
                    const value = $cookies.get("bahmni.user.location");
                    let filterWithoutRoom = $scope.obsData.filter(data => data.conceptNameToDisplay !== 'Opd Consultation Room');
                    let filterRoom = $scope.obsData.filter(data => data.conceptNameToDisplay === 'Opd Consultation Room');
                    let filterEmergency = filterRoom.filter(data => data.formFieldPath.includes('Emergency'));
                    let filterWithoutEmergency = filterRoom.filter(data => !data.formFieldPath.includes('Emergency'));
                    if (JSON.parse(value).name.toLowerCase().includes('emergency')) {
                        $scope.obsData = [...filterWithoutRoom, ...filterEmergency];
                    }
                    else {
                        $scope.obsData = [...filterWithoutRoom, ...filterWithoutEmergency];
                    }
                    $scope.allowRePrint = false;
                    if (JSON.parse(value).name.toLowerCase().includes('emergency')) {
                        if (filterEmergency.length > 0) {
                            $scope.allowRePrint = true;
                        }
                    }
                    else {
                        if (filterWithoutEmergency.length > 0) {
                            $scope.allowRePrint = true;
                        }
                    }
                });

                let IPDFormValidateURL = "/openmrs/ws/rest/v1/obs?patient=" + uuid + "&concept=Visit%20Type";
                $http({
                    method: "GET",
                    url: IPDFormValidateURL
                }).then(function mySuccess (response) {
                    if (response.data.results.length > 0) {
                        $scope.allowRePrintIPD = true;
                    }
                    else {
                        $scope.allowRePrintIPD = false;
                    }
                });
                var getApiData = function (url) {
                    return $http.get(`/openmrs${url}`, {
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
                var getVisitType = function () {
                    return $http.get(`/openmrs/ws/rest/v1/obs?concepts=Visit%20Type%2C%20IPD%20Admission&patient=${$stateParams.patientUuid}`, {
                        method: "GET",
                        withCredentials: true
                    });
                };
                $q.all([getVisitType()]).then(function (response) {
                    if (response[0].data.results.length > 0) {
                        $q.all([getApiData(response[0].data.results[0].links[0].uri.split('/openmrs')[1])]).then(function (response) {
                            $q.all([getApiData(response[0].data.encounter.links[0].uri.split('/openmrs')[1])]).then(function (response) {
                                $scope.preVisitDate = response[0].data.encounterDatetime;
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
                            $scope.dispositionSet = response[0].data.groupMembers.filter(data => data.concept.display === 'Disposition');
                            $scope.dispositionNote = response[0].data.groupMembers.filter(data => data.concept.display === 'Disposition Note');
                        });
                    }
                });
                var getDispositionProvider = function () {
                    return $http.get(`/openmrs/ws/rest/v1/obs?limit=1&concepts=Disposition&patient=${$stateParams.patientUuid}`, {
                        method: "GET",
                        withCredentials: true
                    });
                };
                $q.all([getDispositionProvider()]).then(function (response) {
                    if (response[0].data.results.length > 0) {
                        $q.all([getApiData(response[0].data.results[0].links[0].uri.split('/openmrs')[1])]).then(function (response) {
                            $q.all([getApiData(response[0].data.encounter.links[0].uri.split('/openmrs')[1])]).then(function (response) {
                                $q.all([getApiData(response[0].data.encounterProviders[0].links[0].uri.split('/openmrs')[1])]).then(function (response) {
                                    $q.all([getApiData(response[0].data.provider.links[0].uri.split('/openmrs')[1])]).then(function (response) {
                                        $scope.providerName = response[0].data.person.display;
                                    });
                                    $q.all([getProviderDesignation(response[0].data.provider.uuid)]).then(function (response) {
                                        if (response[0].data.length > 0) {
                                            for (var i = 0; i < response[0].data.length; i++) {
                                                if (response[0].data[i].name == 'Designation') {
                                                    $scope.providerDesignation = response[0].data[i].value_reference;
                                                }
                                            }
                                        }
                                    });
                                });
                            });
                        });
                    }
                });
            }, 500);

            $scope.reprint = function () {
                let reprint = appService.getAppDescriptor().getConfigValue("afterSavePrint");
                $scope.observations = $scope.obsData || $scope.observations;
                var obs = {};
                var getValue = function (observation) {
                    obs[observation.concept.name] = obs[observation.concept.name] || [];
                    observation.value && obs[observation.concept.name].push(observation.value);
                    observation.groupMembers.forEach(getValue);
                };
                $scope.observations.forEach(getValue);
                $scope.obs = obs;
                registrationCardPrinter.print(reprint.templateUrl, $scope.patient, $scope.obs, $scope.encounterDateTime, $scope.observations);
            };

            $scope.reprintAdmissionForm = function () {
                let reprint = appService.getAppDescriptor().getConfigValue("afterSavePrintIPD");
                $scope.observations = $scope.obsData || $scope.observations;
                $scope.observations.preVisitDate = $scope.preVisitDate;
                $scope.observations.dispositionSet = $scope.dispositionSet;
                $scope.observations.dispositionNote = $scope.dispositionNote;
                $scope.observations.providerName = $scope.providerName;
                $scope.observations.providerDesignation = $scope.providerDesignation;
                var obs = {};
                var getValue = function (observation) {
                    obs[observation.concept.name] = obs[observation.concept.name] || [];
                    observation.value && obs[observation.concept.name].push(observation.value);
                    observation.groupMembers.forEach(getValue);
                };
                $scope.observations.forEach(getValue);
                $scope.obs = obs;
                registrationCardPrinter.print(reprint.templateUrl, $scope.patient, $scope.obs, $scope.encounterDateTime, $scope.observations);
            };

            var setReadOnlyFields = function () {
                $scope.readOnlyFields = {};
                var readOnlyFields = appService.getAppDescriptor().getConfigValue("readOnlyFields");
                angular.forEach(readOnlyFields, function (readOnlyField) {
                    if ($scope.patient[readOnlyField]) {
                        $scope.readOnlyFields[readOnlyField] = true;
                    }
                });
            };
            $rootScope.onHomeNavigate = function (event) {
                if ($scope.showSaveConfirmDialogConfig && $state.current.name != "patient.visit") {
                    event.preventDefault();
                    $scope.targetUrl = event.currentTarget.getAttribute('href');
                    isHref = true;
                    $scope.confirmationPrompt(event);
                }
            };
            var successCallBack = function (openmrsPatient) {
                $scope.openMRSPatient = openmrsPatient["patient"];
                $scope.patient = openmrsPatientMapper.map(openmrsPatient);
                setReadOnlyFields();
                expandDataFilledSections();
                $scope.patientLoaded = true;
            };

            var expandDataFilledSections = function () {
                angular.forEach($rootScope.patientConfiguration && $rootScope.patientConfiguration.getPatientAttributesSections(), function (section) {
                    var notNullAttribute = _.find(section && section.attributes, function (attribute) {
                        return $scope.patient[attribute.name] !== undefined;
                    });
                    section.expand = section.expanded || (notNullAttribute ? true : false);
                });
            };

            (function () {
                var getPatientPromise = patientService.get(uuid).then(successCallBack);

                var isDigitized = encounterService.getDigitized(uuid);
                isDigitized.then(function (data) {
                    var encountersWithObservations = data.data.results.filter(function (encounter) {
                        return encounter.obs.length > 0;
                    });
                    $scope.isDigitized = encountersWithObservations.length > 0;
                });

                spinner.forPromise($q.all([getPatientPromise, isDigitized]));
            })();

            $scope.update = function () {
                addNewRelationships();
                var errorMessages = Bahmni.Common.Util.ValidationUtil.validate($scope.patient, $scope.patientConfiguration.attributeTypes);
                if (errorMessages.length > 0) {
                    errorMessages.forEach(function (errorMessage) {
                        messagingService.showMessage('error', errorMessage);
                    });
                    return $q.when({});
                }

                return spinner.forPromise(patientService.update($scope.patient, $scope.openMRSPatient).then(function (result) {
                    var patientProfileData = result.data;
                    if (!patientProfileData.error) {
                        successCallBack(patientProfileData);
                        $scope.actions.followUpAction(patientProfileData);
                    }
                }));
            };

            var addNewRelationships = function () {
                var newRelationships = _.filter($scope.patient.newlyAddedRelationships, function (relationship) {
                    return relationship.relationshipType && relationship.relationshipType.uuid;
                });
                newRelationships = _.each(newRelationships, function (relationship) {
                    delete relationship.patientIdentifier;
                    delete relationship.content;
                    delete relationship.providerName;
                });
                $scope.patient.relationships = _.concat(newRelationships, $scope.patient.deletedRelationships);
            };

            $scope.isReadOnly = function (field) {
                return $scope.readOnlyFields ? ($scope.readOnlyFields[field] ? true : false) : undefined;
            };

            $scope.afterSave = function () {
                auditLogService.log($scope.patient.uuid, Bahmni.Registration.StateNameEvenTypeMap['patient.edit'], undefined, "MODULE_LABEL_REGISTRATION_KEY");
                messagingService.showMessage("info", "REGISTRATION_LABEL_SAVED");
                location.reload();
            };
        }]);
