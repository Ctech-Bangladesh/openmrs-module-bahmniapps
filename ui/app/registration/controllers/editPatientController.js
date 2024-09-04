'use strict';

angular.module('bahmni.registration')
    .controller('EditPatientController', ['$scope', '$cookies', '$timeout', '$http', 'patientService', 'encounterService', '$stateParams', 'openmrsPatientMapper',
        '$window', '$q', 'spinner', 'appService', 'messagingService', '$rootScope', 'auditLogService', 'registrationCardPrinter',
        function ($scope, $cookies, $timeout, $http, patientService, encounterService, $stateParams, openmrsPatientMapper, $window, $q, spinner,
            appService, messagingService, $rootScope, auditLogService, registrationCardPrinter) {
            var dateUtil = Bahmni.Common.Util.DateUtil;
            var uuid = $stateParams.patientUuid;
            $scope.providerName = localStorage.getItem('providerName');
            $scope.providerFacility = localStorage.getItem('providerFacility');
            $scope.patient = {};
            $scope.actions = {};
            $scope.addressHierarchyConfigs = appService.getAppDescriptor().getConfigValue("addressHierarchy");
            $scope.disablePhotoCapture = appService.getAppDescriptor().getConfigValue("disablePhotoCapture");

            $scope.today = dateUtil.getDateWithoutTime(dateUtil.now());

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
            var getApiData = function (url) {
                return $http.get(`/openmrs${url}`, {
                    method: "GET",
                    withCredentials: true
                });
            };
            var user = $cookies.get("bahmni.user");
            var getUser = function (data) {
                return $http.get(`/openmrs/ws/rest/v1/user?username=${data}`, {
                    method: "GET",
                    withCredentials: true
                });
            };
            var getCreator = function (id) {
                return $http.get(`/openmrs/ws/rest/v1/patientprofile/${id}?v=full`, {
                    method: "GET",
                    withCredentials: true
                });
            };
            $scope.reprintHide = true;
            $scope.reprint = function () {
                let reprint = appService.getAppDescriptor().getConfigValue("afterSavePrint");
                $scope.observations = $scope.obsData || $scope.observations;
                $q.all([getUser(JSON.parse(user))]).then(function (response) {
                    if (response[0].data.results.length > 0) {
                        $q.all([getApiData(response[0].data.results[0].links[0].uri.split('/openmrs')[1])]).then(function (response) {
                            $scope.observations.user = response[0].data.person.display;
                        });
                    }
                });
                $q.all([getCreator($stateParams.patientUuid)]).then(function (response) {
                    if (response[0].data.patient.auditInfo) {
                        let auditInfoCreator = response[0].data.patient.auditInfo.creator;
                        $q.all([getUser(auditInfoCreator.display)]).then(function (response) {
                            if (response[0].data.results.length > 0) {
                                $q.all([getApiData(response[0].data.results[0].links[0].uri.split('/openmrs')[1])]).then(function (response) {
                                    $scope.observations.patientCreator = response[0].data.person.display;
                                });
                            }
                        });
                    }
                });

                var obs = {};
                var getValue = function (observation) {
                    obs[observation.concept.name] = obs[observation.concept.name] || [];
                    observation.value && obs[observation.concept.name].push(observation.value);
                    observation.groupMembers.forEach(getValue);
                };
                $scope.observations.forEach(getValue);
                var value = $cookies.get("bahmni.user.location");
                if (JSON.parse(value).name.toLowerCase().includes('emergency')) {
                    $scope.observations.room = 'emergency';
                }
                else {
                    $scope.observations.room = 'opd';
                }
                $scope.obs = obs;
                registrationCardPrinter.print(reprint.templateUrl, $scope.patient, $scope.obs, $scope.encounterDateTime, $scope.observations);
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
            let apiUrl = `/openmrs/module/bahmnicustomutil/check-user-role/${$rootScope.currentUser.person.uuid}.form`;
            $http({
                method: 'GET',
                url: apiUrl
            }).then(function mySuccess (response) {
                var result = response.data;
                if (!result) {
                    $timeout(function () {
                        $scope.allowRePrint = false;
                        $scope.patient.access = true;
                    }, 500);
                } else {
                    $timeout(function () {
                        let apiURL = "/openmrs/ws/rest/v1/bahmnicore/observations?" +
                            "concept=Registration+Fee+Type&concept=Free+Type&" +
                            "concept=Temporary+Categories&concept=Opd+Consultation+Room&" +
                            "patientUuid=" +
                            uuid +
                            "&scope=latest";
                        $http({
                            method: "GET",
                            url: apiURL
                        }).then(function mySuccess (response) {
                            let obsData = response.data;
                            $scope.obsData = obsData;
                            obsData.forEach(key => {
                                $scope.allowRePrint = false;
                                if (key.complexData != null) {
                                    if (key.encounterDateTime != '') {
                                        $scope.allowRePrint = true;
                                    }
                                }
                            });
                        });
                    }, 500);
                    $scope.patient.access = false;
                }
            });
        }]);
