'use strict';

angular.module('bahmni.registration')
    .controller('CreatePatientController', ['$window', '$timeout', '$http', '$scope', '$rootScope', '$state', 'patientService', 'patient', 'spinner', 'appService', 'messagingService', 'ngDialog', '$q',
        function ($window, $timeout, $http, $scope, $rootScope, $state, patientService, patient, spinner, appService, messagingService, ngDialog, $q) {
            var dateUtil = Bahmni.Common.Util.DateUtil;
            $scope.actions = {};
            var errorMessage;
            var configValueForEnterId = appService.getAppDescriptor().getConfigValue('showEnterID');
            $scope.addressHierarchyConfigs = appService.getAppDescriptor().getConfigValue("addressHierarchy");
            $scope.disablePhotoCapture = appService.getAppDescriptor().getConfigValue("disablePhotoCapture");
            $scope.showEnterID = configValueForEnterId === null ? true : configValueForEnterId;
            $scope.today = Bahmni.Common.Util.DateTimeFormatter.getDateWithoutTime(dateUtil.now());
            $window.localStorage.removeItem('refresh');

            if ($window.localStorage.getItem('healthId')) {
                let patientData = JSON.parse($window.localStorage.getItem('healthId'));
                $timeout(function () {
                    $scope.patient.givenName = patientData.given_name;
                    $scope.patient.familyName = patientData.sur_name;
                    $scope.patient.gender = patientData.gender;
                    $scope.patient.birthdate = new Date(patientData.date_of_birth);
                    var currentDate = new Date();
                    var birthDate = new Date(patientData.date_of_birth);
                    var years = currentDate.getFullYear() - birthDate.getFullYear();
                    var months = currentDate.getMonth() - birthDate.getMonth();
                    var days = currentDate.getDate() - birthDate.getDate();
                    if (months < 0 || (months === 0 && days < 0)) {
                        years--;
                        months += 12;
                    }
                    if (days < 0) {
                        var prevMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 0);
                        days = prevMonthDate.getDate() - birthDate.getDate() + currentDate.getDate();
                        months--;
                    }
                    $scope.patient.age.years = years;
                    $scope.patient.age.months = months;
                    $scope.patient.age.days = days;
                    $scope.patient.extraIdentifiers[0].identifier = patientData.hid;
                    $scope.patient.extraIdentifiers[0].registrationNumber = patientData.hid;
                    $scope.patient.nationalId = patientData.nid;
                    $scope.patient.address.address1 = patientData.present_address.address_line;
                    $scope.patient.address.display = patientData.present_address.address_line;
                    $scope.patient.address.address5 = patientData.present_address.upazila;
                    $scope.patient.address.countyDistrict = patientData.present_address.district;
                    $scope.patient.address.stateProvince = patientData.present_address.division;
                }, 100);
                // if (patientData.given_name.length > 0) {
                //     $scope.patient.givenName = patientData.given_name;
                //     $scope.patient.givenName = patientData.given_name;
                // }
            }
            var countRegistration = function (userUuid) {
                let apiUrl = "/openmrs/module/bahmnicustomutil/countRegistrationByUser/" + userUuid + ".form";
                $http({
                    method: 'GET',
                    url: apiUrl
                }).then(function mySuccess (response) {
                    var result = response.data;
                    $scope.userName = result.userName;
                    $scope.totalReg = result.totalRegData[0];
                });
            };
            var getPersonAttributeTypes = function () {
                return $rootScope.patientConfiguration.attributeTypes;
            };

            var prepopulateDefaultsInFields = function () {
                var userUuid = $rootScope.currentUser.uuid;
                $scope.getTotalRegistration = countRegistration(userUuid);
                var personAttributeTypes = getPersonAttributeTypes();
                var patientInformation = appService.getAppDescriptor().getConfigValue("patientInformation");
                if (!patientInformation || !patientInformation.defaults) {
                    return;
                }
                var defaults = patientInformation.defaults;
                var defaultVariableNames = _.keys(defaults);

                var hasDefaultAnswer = function (personAttributeType) {
                    return _.includes(defaultVariableNames, personAttributeType.name);
                };

                var isConcept = function (personAttributeType) {
                    return personAttributeType.format === "org.openmrs.Concept";
                };

                var setDefaultAnswer = function (personAttributeType) {
                    $scope.patient[personAttributeType.name] = defaults[personAttributeType.name];
                };

                var setDefaultConcept = function (personAttributeType) {
                    var defaultAnswer = defaults[personAttributeType.name];
                    var isDefaultAnswer = function (answer) {
                        return answer.fullySpecifiedName === defaultAnswer;
                    };

                    _.chain(personAttributeType.answers).filter(isDefaultAnswer).each(function (answer) {
                        $scope.patient[personAttributeType.name] = {
                            conceptUuid: answer.conceptId,
                            value: answer.fullySpecifiedName
                        };
                    }).value();
                };

                _.chain(personAttributeTypes)
                    .filter(hasDefaultAnswer)
                    .each(setDefaultAnswer).filter(isConcept).each(setDefaultConcept).value();
            };

            var expandSectionsWithDefaultValue = function () {
                angular.forEach($rootScope.patientConfiguration && $rootScope.patientConfiguration.getPatientAttributesSections(), function (section) {
                    var notNullAttribute = _.find(section && section.attributes, function (attribute) {
                        return $scope.patient[attribute.name] !== undefined;
                    });
                    section.expand = section.expanded || (notNullAttribute ? true : false);
                });
            };

            var init = function () {
                $scope.patient = patient.create();
                prepopulateDefaultsInFields();
                expandSectionsWithDefaultValue();
                $scope.patientLoaded = true;
            };

            init();

            var prepopulateFields = function () {
                var fieldsToPopulate = appService.getAppDescriptor().getConfigValue("prepopulateFields");
                if (fieldsToPopulate) {
                    _.each(fieldsToPopulate, function (field) {
                        var addressLevel = _.find($scope.addressLevels, function (level) {
                            return level.name === field;
                        });
                        if (addressLevel) {
                            $scope.patient.address[addressLevel.addressField] = $rootScope.loggedInLocation[addressLevel.addressField];
                        }
                    });
                }
            };
            prepopulateFields();

            var addNewRelationships = function () {
                var newRelationships = _.filter($scope.patient.newlyAddedRelationships, function (relationship) {
                    return relationship.relationshipType && relationship.relationshipType.uuid;
                });
                newRelationships = _.each(newRelationships, function (relationship) {
                    delete relationship.patientIdentifier;
                    delete relationship.content;
                    delete relationship.providerName;
                });
                $scope.patient.relationships = newRelationships;
            };

            var getConfirmationViaNgDialog = function (config) {
                var ngDialogLocalScope = config.scope.$new();
                ngDialogLocalScope.yes = function () {
                    ngDialog.close();
                    config.yesCallback();
                };
                ngDialogLocalScope.no = function () {
                    ngDialog.close();
                };
                ngDialog.open({
                    template: config.template,
                    data: config.data,
                    scope: ngDialogLocalScope
                });
            };

            var copyPatientProfileDataToScope = function (response) {
                var patientProfileData = response.data;
                $scope.patient.uuid = patientProfileData.patient.uuid;
                $scope.patient.name = patientProfileData.patient.person.names[0].display;
                $scope.patient.isNew = true;
                $scope.patient.registrationDate = dateUtil.now();
                $scope.patient.newlyAddedRelationships = [{}];
                $scope.actions.followUpAction(patientProfileData);
            };
            var geoCode = [];
            fetch(`https://${$window.location.hostname}:6061/api/v1/health-id/geo-codes`)
                .then(response => response.json())
                .then(data => {
                    if (data) {
                        geoCode = data;
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                });
            // $scope.healtIdBtn = true;
            $scope.generateHealthId = function () {
                let divisionName = $scope.patient.address.stateProvince;
                let districtName = $scope.patient.address.countyDistrict;
                let upazilaName = $scope.patient.address.address5;
                function transformData (data) {
                    var divisionId = geoCode.find(division => division.type === "division" && division.name.includes(divisionName.toUpperCase())).division_id;
                    var districtId = geoCode.find(district => district.type === "district" && district.name.includes(districtName.toUpperCase())).district_id;
                    var upazilaId = geoCode.find(upazila => upazila.type === "upazila" && upazila.name.includes(upazilaName.toUpperCase())).upazila_id;
                    if (data.nationalId) {
                        return {
                            given_name: data.givenName,
                            sur_name: data.familyName,
                            date_of_birth: data.birthdate ? data.birthdate.toISOString().substring(0, 10) : null,
                            gender: data.gender,
                            nid: data.nationalId,
                            bin_brn: '',
                            present_address: {
                                address_line: data.address.address1,
                                division_id: divisionId,
                                district_id: districtId,
                                upazila_id: upazilaId
                            },
                            confidential: "No"
                        };
                    } else {
                        return {
                            given_name: data.givenName,
                            sur_name: data.familyName,
                            date_of_birth: data.birthdate ? data.birthdate.toISOString().substring(0, 10) : null,
                            gender: data.gender,
                            nid: '',
                            bin_brn: data.birthRegistrationId,
                            present_address: {
                                address_line: data.address.address1,
                                division_id: divisionId,
                                district_id: districtId,
                                upazila_id: upazilaId
                            },
                            confidential: "No"
                        };
                    }
                }
                if ($scope.patient.givenName && $scope.patient.familyName && $scope.patient.birthdate && $scope.patient.gender && $scope.patient.address.stateProvince && $scope.patient.address.countyDistrict && $scope.patient.address.address5 && $scope.patient.address.address1) {
                    let dataBody = transformData($scope.patient);
                    fetch(`https://${$window.location.hostname}:6061/api/v1/health-id`,
                        {
                            method: "POST",
                            body: JSON.stringify(dataBody),
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        })
                        .then(response => {
                            if (!response.ok) {
                                throw new Error('Request failed with status ' + response.status);
                            }
                            return response.json();
                        })
                        .then(res => {
                            if (res.statusCode === 201) {
                                $timeout(function () {
                                    $scope.patient.extraIdentifiers[0].identifier = res.content.id;
                                    $scope.patient.extraIdentifiers[0].registrationNumber = res.content.id;
                                }, 100);
                            } else if (res.statusCode === 208) {
                                let patientData = res.content;
                                var result = window.confirm(`Patient already registered with this NID/BRN. Do you want to replace with the existing info?`);
                                if (result === true) {
                                    res.content.present_address.division = geoCode.find(division => division.type === "division" && division.division_id.includes(res.content.present_address.division_id)).name;
                                    res.content.present_address.district = geoCode.find(district => district.type === "district" && district.district_id.includes(res.content.present_address.district_id) && district.division_id.includes(res.content.present_address.division_id)).name;
                                    res.content.present_address.upazila = geoCode.find(upazila => upazila.type === "upazila" && upazila.upazila_id.includes(res.content.present_address.upazila_id) && upazila.district_id.includes(res.content.present_address.district_id) && upazila.division_id.includes(res.content.present_address.division_id)).name;
                                    localStorage.setItem("healthId", JSON.stringify(res.content));
                                    $timeout(function () {
                                        $scope.patient.givenName = patientData.given_name;
                                        $scope.patient.familyName = patientData.sur_name;
                                        $scope.patient.gender = patientData.gender;
                                        $scope.patient.birthdate = new Date(patientData.date_of_birth);
                                        var currentDate = new Date();
                                        var birthDate = new Date(patientData.date_of_birth);
                                        var years = currentDate.getFullYear() - birthDate.getFullYear();
                                        var months = currentDate.getMonth() - birthDate.getMonth();
                                        var days = currentDate.getDate() - birthDate.getDate();
                                        if (months < 0 || (months === 0 && days < 0)) {
                                            years--;
                                            months += 12;
                                        }
                                        if (days < 0) {
                                            var prevMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 0);
                                            days = prevMonthDate.getDate() - birthDate.getDate() + currentDate.getDate();
                                            months--;
                                        }
                                        $scope.patient.age.years = years;
                                        $scope.patient.age.months = months;
                                        $scope.patient.age.days = days;
                                        $scope.patient.extraIdentifiers[0].identifier = patientData.hid;
                                        $scope.patient.extraIdentifiers[0].registrationNumber = patientData.hid;
                                        $scope.patient.nationalId = patientData.nid;
                                        $scope.patient.address.address1 = patientData.present_address.address_line;
                                        $scope.patient.address.display = patientData.present_address.address_line;
                                        $scope.patient.address.stateProvince = geoCode.find(division => division.type === "division" && division.division_id.includes(res.content.present_address.division_id)).name;
                                        $scope.patient.address.countyDistrict = geoCode.find(district => district.type === "district" && district.district_id.includes(res.content.present_address.district_id) && district.division_id.includes(res.content.present_address.division_id)).name;
                                        $scope.patient.address.address5 = geoCode.find(upazila => upazila.type === "upazila" && upazila.upazila_id.includes(res.content.present_address.upazila_id) && upazila.district_id.includes(res.content.present_address.district_id) && upazila.division_id.includes(res.content.present_address.division_id)).name;
                                    }, 100);
                                }
                            }
                        })
                        .catch(error => {
                            window.alert('There was an error!');
                            console.error('Error:', error);
                            // errorMessage = 'There was an error';
                        });
                } else {
                    window.alert('Please enter all information.');
                }
            };
            var createPatient = function (jumpAccepted) {
                return patientService.create($scope.patient, jumpAccepted).then(function (response) {
                    copyPatientProfileDataToScope(response);
                }, function (response) {
                    if (response.status === 412) {
                        var data = _.map(response.data, function (data) {
                            return {
                                sizeOfTheJump: data.sizeOfJump,
                                identifierName: _.find($rootScope.patientConfiguration.identifierTypes, { uuid: data.identifierType }).name
                            };
                        });
                        getConfirmationViaNgDialog({
                            template: 'views/customIdentifierConfirmation.html',
                            data: data,
                            scope: $scope,
                            yesCallback: function () {
                                return createPatient(true);
                            }
                        });
                    }
                    if (response.isIdentifierDuplicate) {
                        errorMessage = response.message;
                    }
                });
            };

            var createPromise = function () {
                var deferred = $q.defer();
                createPatient().finally(function () {
                    return deferred.resolve({});
                });
                return deferred.promise;
            };

            $scope.create = function () {
                addNewRelationships();
                var errorMessages = Bahmni.Common.Util.ValidationUtil.validate($scope.patient, $scope.patientConfiguration.attributeTypes);
                if (errorMessages.length > 0) {
                    errorMessages.forEach(function (errorMessage) {
                        messagingService.showMessage('error', errorMessage);
                    });
                    return $q.when({});
                }
                return spinner.forPromise(createPromise()).then(function (response) {
                    if (errorMessage) {
                        messagingService.showMessage("error", errorMessage);
                        errorMessage = undefined;
                    }
                });
            };

            $scope.afterSave = function () {
                messagingService.showMessage("info", "REGISTRATION_LABEL_SAVED");
                $state.go("patient.edit", {
                    patientUuid: $scope.patient.uuid
                });
            };
        }
    ]);
