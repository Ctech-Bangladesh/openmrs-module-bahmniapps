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
                    var value = $cookies.get("bahmni.user.location");
                    if (JSON.parse(value).name === "Emergency") {
                        $scope.obsData = $scope.obsData.filter(data => data.formFieldPath !== 'Room To Assign.2/1-0');
                    }
                    else {
                        $scope.obsData = $scope.obsData.filter(data => data.formFieldPath !== 'Room To Assign Emergency.1/1-0');
                    }
                    obsData.forEach(key => {
                        $scope.allowRePrint = false;
                        if (key.complexData != null) {
                            if (key.encounterDateTime !== '') {
                                if (JSON.parse(value).name === "Emergency") {
                                    var filterEmergency = $scope.obsData.filter(data => data.formFieldPath === 'Room To Assign Emergency.1/1-0');
                                    if (filterEmergency.length > 0) {
                                        $scope.allowRePrint = true;
                                    }
                                }
                                else {
                                    var filterWithoutEmergency = $scope.obsData.filter(data => data.formFieldPath === 'Room To Assign.2/1-0');
                                    if (filterWithoutEmergency.length > 0) {
                                        $scope.allowRePrint = true;
                                    }
                                }
                            }
                        }
                    });
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
