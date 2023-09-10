'use strict';

angular.module('bahmni.registration')
    .controller('CreatePatientController', ['$scope', '$timeout', '$window', '$http', '$rootScope', '$state', 'patientService', 'patient', 'spinner', 'appService', 'messagingService', 'ngDialog', '$q',
        function ($scope, $timeout, $window, $http, $rootScope, $state, patientService, patient, spinner, appService, messagingService, ngDialog, $q) {
            var dateUtil = Bahmni.Common.Util.DateUtil;
            $scope.actions = {};
            var errorMessage;
            const healthIDEnable = appService.getAppDescriptor().getConfigValue("healthIdEnable");
            var configValueForEnterId = appService.getAppDescriptor().getConfigValue('showEnterID');
            $scope.addressHierarchyConfigs = appService.getAppDescriptor().getConfigValue("addressHierarchy");
            $scope.disablePhotoCapture = appService.getAppDescriptor().getConfigValue("disablePhotoCapture");
            $scope.showEnterID = configValueForEnterId === null ? true : configValueForEnterId;
            $scope.today = Bahmni.Common.Util.DateTimeFormatter.getDateWithoutTime(dateUtil.now());
            window.sessionStorage.removeItem('free');
            if (healthIDEnable) {
                if ($window.localStorage.getItem("healthId")) {
                    let patientData = JSON.parse($window.localStorage.getItem("healthId"));
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
                            var prevMonthDate = new Date(
                                currentDate.getFullYear(),
                                currentDate.getMonth() - 1,
                                0
                            );
                            days = prevMonthDate.getDate() - birthDate.getDate() + currentDate.getDate();
                            months--;
                        }
                        $scope.patient.age.years = years;
                        $scope.patient.age.months = months;
                        $scope.patient.age.days = days;
                        $scope.patient.extraIdentifiers[0].identifier = patientData.hid;
                        $scope.patient.extraIdentifiers[0].registrationNumber = patientData.hid;
                        $scope.patient.nationalId = patientData.nid;
                        $scope.patient.address.address1 =
                            patientData.present_address.address_line;
                        $scope.patient.address.display =
                            patientData.present_address.address_line;
                        $scope.patient.address.address5 =
                            patientData.present_address.upazila_id;
                        $scope.patient.address.countyDistrict =
                            patientData.present_address.district_id;
                        $scope.patient.address.stateProvince =
                            patientData.present_address.division_id;
                    }, 100);
                }
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

            $scope.generateHealthId = function (jumpAccepted) {
                const districtName = $scope.patient.address.countyDistrict;
                const upazilaName = $scope.patient.address.address5;
                let divisionId = "";
                let districtId = "";
                let upazilaId = "";
                fetch(
                    `https://${$window.location.hostname}:6062/api/v1/health-id/geo-code/${districtName}/${upazilaName}`,
                    {
                        method: "GET",
                        headers: {
                            "Content-Type": "application/json"
                        }
                    }
                )
                    .then((response) => {
                        if (!response.ok) {
                            return patientService
                                .create($scope.patient, jumpAccepted)
                                .then(
                                    function (response) {
                                        copyPatientProfileDataToScope(response);
                                    },
                                    function (response) {
                                        if (response.status === 412) {
                                            var data = _.map(response.data, function (data) {
                                                return {
                                                    sizeOfTheJump: data.sizeOfJump,
                                                    identifierName: _.find(
                                                        $rootScope.patientConfiguration.identifierTypes,
                                                        { uuid: data.identifierType }
                                                    ).name
                                                };
                                            });
                                            getConfirmationViaNgDialog({
                                                template: "views/customIdentifierConfirmation.html",
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
                                    }
                                );
                        }
                        return response.json();
                    })
                    .then((res) => {
                        if (res.statusCode === 200) {
                            divisionId = res.content.divisionCode;
                            districtId = res.content.districtCode;
                            upazilaId = res.content.upazillaCode;
                        }
                        const dataBody = transformData($scope.patient);
                        if (
                            $scope.patient.phoneNumber &&
                            ($scope.patient.nationalId || $scope.patient.birthRegistrationId)
                        ) {
                            spinner.forAjaxPromise(fetch(
                                `https://${$window.location.hostname}:6062/api/v1/health-id`,
                                {
                                    method: "POST",
                                    body: JSON.stringify(dataBody),
                                    headers: {
                                        "Content-Type": "application/json"
                                    }
                                }
                            )
                                .then((response) => {
                                    if (!response.ok) {
                                        return patientService
                                            .create($scope.patient, jumpAccepted)
                                            .then(
                                                function (response) {
                                                    copyPatientProfileDataToScope(response);
                                                },
                                                function (response) {
                                                    if (response.status === 412) {
                                                        var data = _.map(response.data, function (data) {
                                                            return {
                                                                sizeOfTheJump: data.sizeOfJump,
                                                                identifierName: _.find(
                                                                    $rootScope.patientConfiguration.identifierTypes,
                                                                    { uuid: data.identifierType }
                                                                ).name
                                                            };
                                                        });
                                                        getConfirmationViaNgDialog({
                                                            template: "views/customIdentifierConfirmation.html",
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
                                                }
                                            );
                                        // throw new Error(
                                        //   "Request failed with status " + response.status
                                        // );
                                    }
                                    return response.json();
                                })
                                .then((res) => {
                                    if (res.statusCode === 201) {
                                        $scope.patient.extraIdentifiers[0].identifier =
                                            res.content.id;
                                        $scope.patient.extraIdentifiers[0].registrationNumber =
                                            res.content.id;
                                        return patientService
                                            .create($scope.patient, jumpAccepted)
                                            .then(
                                                function (response) {
                                                    copyPatientProfileDataToScope(response);
                                                },
                                                function (response) {
                                                    if (response.status === 412) {
                                                        var data = _.map(response.data, function (data) {
                                                            return {
                                                                sizeOfTheJump: data.sizeOfJump,
                                                                identifierName: _.find(
                                                                    $rootScope.patientConfiguration.identifierTypes,
                                                                    { uuid: data.identifierType }
                                                                ).name
                                                            };
                                                        });
                                                        getConfirmationViaNgDialog({
                                                            template: "views/customIdentifierConfirmation.html",
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
                                                }
                                            );
                                    } else if (res.statusCode === 208) {
                                        res.content.present_address.division =
                                            res.content.present_address.division_id;
                                        res.content.present_address.district =
                                            res.content.present_address.district_id;
                                        res.content.present_address.upazila =
                                            res.content.present_address.upazila_id;
                                        localStorage.setItem("healthId", JSON.stringify(res.content));
                                        const patientData = res.content;
                                        $scope.patient.givenName = patientData.given_name;
                                        $scope.patient.familyName = patientData.sur_name;
                                        $scope.patient.gender = patientData.gender;
                                        $scope.patient.birthdate = new Date(
                                            patientData.date_of_birth
                                        );
                                        var currentDate = new Date();
                                        var birthDate = new Date(patientData.date_of_birth);
                                        var years =
                                            currentDate.getFullYear() - birthDate.getFullYear();
                                        var months = currentDate.getMonth() - birthDate.getMonth();
                                        var days = currentDate.getDate() - birthDate.getDate();
                                        if (months < 0 || (months === 0 && days < 0)) {
                                            years--;
                                            months += 12;
                                        }
                                        if (days < 0) {
                                            var prevMonthDate = new Date(
                                                currentDate.getFullYear(),
                                                currentDate.getMonth() - 1,
                                                0
                                            );
                                            days =
                                                prevMonthDate.getDate() -
                                                birthDate.getDate() +
                                                currentDate.getDate();
                                            months--;
                                        }
                                        var stateProvince = res.content.present_address.division_id;
                                        var countyDistrict = res.content.present_address.district_id;
                                        var upazila = res.content.present_address.upazila_id;
                                        $scope.patient.age.years = years;
                                        $scope.patient.age.months = months;
                                        $scope.patient.age.days = days;
                                        $scope.patient.extraIdentifiers[0].identifier =
                                            patientData.hid;
                                        $scope.patient.extraIdentifiers[0].registrationNumber =
                                            patientData.hid;
                                        $scope.patient.nationalId = patientData.nid;
                                        $scope.patient.address.address1 =
                                            patientData.present_address.address_line;
                                        $scope.patient.address.display =
                                            patientData.present_address.address_line;
                                        $scope.patient.address.stateProvince = stateProvince;
                                        $scope.patient.address.countyDistrict = countyDistrict;
                                        $scope.patient.address.address5 = upazila;
                                        return patientService
                                            .create($scope.patient, jumpAccepted)
                                            .then(
                                                function (response) {
                                                    copyPatientProfileDataToScope(response);
                                                },
                                                function (response) {
                                                    if (response.status === 412) {
                                                        var data = _.map(response.data, function (data) {
                                                            return {
                                                                sizeOfTheJump: data.sizeOfJump,
                                                                identifierName: _.find(
                                                                    $rootScope.patientConfiguration.identifierTypes,
                                                                    { uuid: data.identifierType }
                                                                ).name
                                                            };
                                                        });
                                                        getConfirmationViaNgDialog({
                                                            template: "views/customIdentifierConfirmation.html",
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
                                                }
                                            );
                                    } else if (res.statusCode === 400) {
                                        $scope.patient.nationalId = 'Not Verified';
                                        return patientService
                                            .create($scope.patient, jumpAccepted)
                                            .then(
                                                function (response) {
                                                    copyPatientProfileDataToScope(response);
                                                },
                                                function (response) {
                                                    if (response.status === 412) {
                                                        var data = _.map(response.data, function (data) {
                                                            return {
                                                                sizeOfTheJump: data.sizeOfJump,
                                                                identifierName: _.find(
                                                                    $rootScope.patientConfiguration.identifierTypes,
                                                                    { uuid: data.identifierType }
                                                                ).name
                                                            };
                                                        });
                                                        getConfirmationViaNgDialog({
                                                            template: "views/customIdentifierConfirmation.html",
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
                                                }
                                            );
                                    } else {
                                        return patientService
                                            .create($scope.patient, jumpAccepted)
                                            .then(
                                                function (response) {
                                                    copyPatientProfileDataToScope(response);
                                                },
                                                function (response) {
                                                    if (response.status === 412) {
                                                        var data = _.map(response.data, function (data) {
                                                            return {
                                                                sizeOfTheJump: data.sizeOfJump,
                                                                identifierName: _.find(
                                                                    $rootScope.patientConfiguration.identifierTypes,
                                                                    { uuid: data.identifierType }
                                                                ).name
                                                            };
                                                        });
                                                        getConfirmationViaNgDialog({
                                                            template: "views/customIdentifierConfirmation.html",
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
                                                }
                                            );
                                    }
                                })
                                .catch((error) => {
                                    console.error("Error:", error);
                                    // errorMessage = 'There was an error';
                                }));
                        } else {
                            return patientService.create($scope.patient, jumpAccepted).then(
                                function (response) {
                                    copyPatientProfileDataToScope(response);
                                },
                                function (response) {
                                    if (response.status === 412) {
                                        var data = _.map(response.data, function (data) {
                                            return {
                                                sizeOfTheJump: data.sizeOfJump,
                                                identifierName: _.find(
                                                    $rootScope.patientConfiguration.identifierTypes,
                                                    { uuid: data.identifierType }
                                                ).name
                                            };
                                        });
                                        getConfirmationViaNgDialog({
                                            template: "views/customIdentifierConfirmation.html",
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
                                }
                            );
                        }
                    });
                function transformData (data) {
                    var userUuid = $rootScope.currentUser.uuid;
                    if (data.nationalId) {
                        return {
                            performer: userUuid,
                            given_name: data.givenName,
                            sur_name: data.familyName,
                            mobile: data.phoneNumber,
                            date_of_birth: data.birthdate
                                ? data.birthdate.toISOString().substring(0, 10)
                                : null,
                            gender: data.gender,
                            nid: data.nationalId,
                            bin_brn: "",
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
                            performer: userUuid,
                            given_name: data.givenName,
                            sur_name: data.familyName,
                            mobile: data.phoneNumber,
                            date_of_birth: data.birthdate
                                ? data.birthdate.toISOString().substring(0, 10)
                                : null,
                            gender: data.gender,
                            nid: "",
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
            };

            var createPatient = function (jumpAccepted) {
                if (healthIDEnable) {
                    $scope.generateHealthId(jumpAccepted);
                    return new Promise(function (resolve, reject) {
                        $timeout(function () {
                            resolve({});
                        }, 3000);
                    });
                } else {
                    return patientService
                        .create($scope.patient, jumpAccepted)
                        .then(
                            function (response) {
                                copyPatientProfileDataToScope(response);
                            },
                            function (response) {
                                if (response.status === 412) {
                                    var data = _.map(response.data, function (data) {
                                        return {
                                            sizeOfTheJump: data.sizeOfJump,
                                            identifierName: _.find(
                                                $rootScope.patientConfiguration.identifierTypes,
                                                { uuid: data.identifierType }
                                            ).name
                                        };
                                    });
                                    getConfirmationViaNgDialog({
                                        template: "views/customIdentifierConfirmation.html",
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
                            }
                        );
                }
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
