'use strict';

angular.module('bahmni.registration')
    .controller('CreatePatientController', ['$scope', '$timeout', '$window', '$http', '$rootScope', '$state', 'patientService', 'patient', 'spinner', 'appService', 'messagingService', 'ngDialog', '$q',
        function ($scope, $timeout, $window, $http, $rootScope, $state, patientService, patient, spinner, appService, messagingService, ngDialog, $q) {
            var dateUtil = Bahmni.Common.Util.DateUtil;
            $scope.actions = {};
            var errorMessage;
            $scope.getPatientBtnHide = false;
            $scope.providerName = localStorage.getItem('providerName');
            const healthIDEnable = appService.getAppDescriptor().getConfigValue("healthIdEnable");
            var configValueForEnterId = appService.getAppDescriptor().getConfigValue('showEnterID');
            $scope.addressHierarchyConfigs = appService.getAppDescriptor().getConfigValue("addressHierarchy");
            $scope.disablePhotoCapture = appService.getAppDescriptor().getConfigValue("disablePhotoCapture");
            $scope.showEnterID = configValueForEnterId === null ? true : configValueForEnterId;
            $scope.today = Bahmni.Common.Util.DateTimeFormatter.getDateWithoutTime(dateUtil.now());
            window.sessionStorage.removeItem('free');
            const convertToYYYYMMDD = (timestamp) => {
                const date = new Date(timestamp);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is zero-based
                const day = String(date.getDate()).padStart(2, '0');

                return `${year}-${month}-${day}`;
            };
            const patientNIDData = (data) => {
                return {
                    performer: $rootScope.currentUser.uuid,
                    nidOrBrn: data.nationalId ? data.nationalId : data.birthRegistrationId,
                    type: data.nationalId ? "nid" : "brn",
                    name: 'patient',
                    dob: convertToYYYYMMDD(data.birthdate)

                };
            };
            const resetPatient = () => {
                $scope.patient.givenName = '';
                $scope.patient.givenNameLocal = '';

                $scope.patient.primaryRelative = '';
                $scope.patient.motherName = '';
                $scope.patient.givenFatherNameLocal = '';
                $scope.patient.givenMotherNameLocal = '';

                $scope.patient.address.address1 = '';
                $scope.patient.address.display = '';
                $scope.patient.extraIdentifiers[0].identifier = '';
                $scope.patient.extraIdentifiers[0].registrationNumber = '';
            };
            const checkHealthID = (spinnerToken, endPoint) => {
                return fetch(`https://${$window.location.hostname}:6062/api/v1/health-id/${endPoint}`)
                    .then((response) => {
                        if (!response.ok) {
                            $timeout(function () {
                                resetPatient();
                                messagingService.showMessage("error", "Something went wrong in MCI Server, Please try again.");
                                spinner.hide(spinnerToken);
                            });
                            // throw new Error(`Request failed with status: ${response.status}`);
                        }
                        return response.json();
                    });
            };
            $scope.getPatientInfo = () => {
                if (!$scope.patient.birthdate && (!$scope.patient.nationalId || !$scope.patient.birthRegistrationId)) {
                    return $timeout(function () {
                        messagingService.showMessage("error", "Please provide birth date and NID/Birth registration number");
                    });
                }
                const isNationalIdPresent = $scope.patient.nationalId;
                const endPoint = isNationalIdPresent ? `nid/${$scope.patient.nationalId}` : `brn/${$scope.patient.birthRegistrationId}`;
                const spinnerToken = spinner.show();
                checkHealthID(spinnerToken, endPoint).then((healthIdCheck) => {
                    if (healthIdCheck.results && healthIdCheck.results.length > 0) {
                        const patientData = healthIdCheck.results[0];
                        fetch(`https://${$window.location.hostname}:6062/api/v1/health-id/geo-code?upazillaCode=${patientData.present_address.upazila_id}&districtCode=${patientData.present_address.district_id}&divisionCode=${patientData.present_address.division_id}`)
                            .then((response) => {
                                if (!response.ok) {
                                    throw new Error(`Request failed with status: ${response.status}`);
                                }
                                return response.json();
                            })
                            .then((res) => {
                                if (res) {
                                    $timeout(function () {
                                        resetPatient();
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
                                        var stateProvince = res.content.division;
                                        var countyDistrict = res.content.district;
                                        var upazila = res.content.upazilla;
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
                                        fetch(`https://${$window.location.hostname}:6062/api/v1/health-id/${patientData.hid}`)
                                            .then((response) => {
                                                if (!response.ok) {
                                                    throw new Error(`Request failed with status: ${response.status}`);
                                                }
                                                return response.json();
                                            })
                                            .then((res) => {
                                                if (res.statusCode === 200) {
                                                    $timeout(function () {
                                                        const patientData = res.content;
                                                        $scope.patient.givenNameLocal = patientData.name_bangla;
                                                        $scope.patient.phoneNumber = patientData.phone_number ? patientData.phone_number.number : '';
                                                        if (patientData.relations) {
                                                            const fatherRelation = patientData.relations.find(relation => relation.type === 'FTH');
                                                            const motherRelation = patientData.relations.find(relation => relation.type === 'MTH');
                                                            if (fatherRelation) {
                                                                $scope.patient.primaryRelative = fatherRelation.given_name;
                                                                $scope.patient.givenFatherNameLocal = fatherRelation.name_bangla;
                                                            }
                                                            if (motherRelation) {
                                                                $scope.patient.motherName = motherRelation.given_name;
                                                                $scope.patient.givenMotherNameLocal = motherRelation.name_bangla;
                                                            }
                                                        }
                                                        $scope.getPatientBtnHide = true;
                                                        spinner.hide(spinnerToken);
                                                        messagingService.showMessage("info", "Patient information retrieved successfully");
                                                    });
                                                }
                                            })
                                            .catch((error) => {
                                                console.error("Error:", error);
                                            });
                                    });
                                    // return patientCreate($scope.patient, jumpAccepted);
                                }
                            });
                    } else if (healthIdCheck.http_status === 400) {
                        $timeout(function () {
                            resetPatient();
                            spinner.hide(spinnerToken);
                            messagingService.showMessage("error", "Invalid BRN/NID");
                        });
                    } else if (healthIdCheck.status !== 500) {
                        fetch(`https://${$window.location.hostname}:6062/api/v1/health-id/nid-verify`,
                            {
                                method: "POST",
                                body: JSON.stringify(patientNIDData($scope.patient)),
                                headers: {
                                    "Content-Type": "application/json"
                                }
                            }
                        )
                            .then((response) => {
                                if (!response.ok) {
                                    $timeout(function () {
                                        resetPatient();
                                        messagingService.showMessage("error", "Something went wrong in NID Server, Please try again.");
                                        spinner.hide(spinnerToken);
                                    });
                                    // throw new Error(`Request failed with status: ${response.status}`);
                                }
                                return response.json();
                            })
                            .then((response) => {
                                if (response.verifyToken) {
                                    $timeout(function () {
                                        resetPatient();
                                        const nidData = response.citizenData;
                                        $scope.patient.givenName = nidData.fullName_English;
                                        $scope.patient.givenNameLocal = nidData.fullName_Bangla;
                                        $scope.patient.gender = nidData.gender === 1 ? 'M' : nidData.gender === 2 ? 'F' : 'O';

                                        $scope.patient.primaryRelative = nidData.fatherName_English;
                                        $scope.patient.motherName = nidData.motherName_English;
                                        $scope.patient.givenFatherNameLocal = nidData.fatherName_Bangla;
                                        $scope.patient.givenMotherNameLocal = nidData.motherName_Bangla;

                                        $scope.patient.birthdate = new Date(nidData.dob);
                                        var currentDate = new Date();
                                        var birthDate = new Date(nidData.dob);
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
                                        $scope.patient.nationalId = nidData.citizen_nid ? nidData.citizen_nid : $scope.patient.nationalId;
                                        $scope.patient.birthRegistrationId = nidData.bin_BRN ? nidData.bin_BRN : $scope.patient.birthRegistrationId;

                                        if (nidData.presentHouseholdNoText) {
                                            $scope.patient.address.address1 = nidData.presentHouseholdNoText;
                                            $scope.patient.address.display = nidData.presentHouseholdNoText;
                                        } else {
                                            const addressComponents = [
                                                nidData.presentHouseholdNo.houseOrHoldingNo,
                                                nidData.presentHouseholdNo.villageOrRoad,
                                                nidData.presentHouseholdNo.mouzaOrMoholla,
                                                nidData.presentHouseholdNo.unionOrWard,
                                                nidData.presentHouseholdNo.upazilla,
                                                nidData.presentHouseholdNo.district,
                                                nidData.presentHouseholdNo.division
                                            ];
                                            const nidAddressData = addressComponents.filter(item => item !== "." && item !== "" && item !== "-" && item !== "--" && item !== "," && item !== null).join(', ');
                                            $scope.patient.address.address1 = nidAddressData;
                                            $scope.patient.address.display = nidAddressData;
                                        }
                                        spinner.hide(spinnerToken);
                                        messagingService.showMessage("info", "Patient information retrieved successfully");
                                    });
                                } else if (response.status !== 500) {
                                    $timeout(function () {
                                        resetPatient();
                                        messagingService.showMessage("error", "Patient information not available.");
                                        spinner.hide(spinnerToken);
                                    });
                                }
                            });
                    }
                });
            };

            if (healthIDEnable) {
                if ($window.localStorage.getItem("healthId")) {
                    let patientData = JSON.parse($window.localStorage.getItem("healthId"));
                    $timeout(function () {
                        $scope.getPatientBtnHide = true;
                        $scope.patient.givenName = patientData.given_name;
                        $scope.patient.givenNameLocal = patientData.name_bangla;
                        $scope.patient.familyName = patientData.sur_name;
                        $scope.patient.phoneNumber = patientData.phone_number ? patientData.phone_number.number : '';
                        $scope.patient.gender = patientData.gender;
                        if (patientData.relations) {
                            const fatherRelation = patientData.relations.find(relation => relation.type === 'FTH');
                            const motherRelation = patientData.relations.find(relation => relation.type === 'MTH');
                            if (fatherRelation) {
                                $scope.patient.primaryRelative = fatherRelation.given_name;
                                $scope.patient.givenFatherNameLocal = fatherRelation.name_bangla;
                            }
                            if (motherRelation) {
                                $scope.patient.motherName = motherRelation.given_name;
                                $scope.patient.givenMotherNameLocal = motherRelation.name_bangla;
                            }
                        }

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
                        $scope.patient.nationalId = patientData.nid ? patientData.nid : '';
                        $scope.patient.birthRegistrationId = patientData.bin_brn ? patientData.bin_brn : '';
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
                }).then((response) => {
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
                const spinnerToken = spinner.show();
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
                            return patientCreate($scope.patient, jumpAccepted, spinnerToken);
                        }
                        return response.json();
                    })
                    .then((res) => {
                        if (res.statusCode === 200) {
                            divisionId = res.content.divisionCode;
                            districtId = res.content.districtCode;
                            upazilaId = res.content.upazillaCode;
                        }
                        if ($scope.patient.nationalId || $scope.patient.birthRegistrationId) {
                            const isNationalIdPresent = $scope.patient.nationalId;
                            const endPoint = isNationalIdPresent ? `nid/${$scope.patient.nationalId}` : `brn/${$scope.patient.birthRegistrationId}`;
                            fetch(`https://${$window.location.hostname}:6062/api/v1/health-id/${endPoint}`)
                            .then((response) => {
                                if (!response.ok) {
                                    return patientCreate($scope.patient, jumpAccepted, spinnerToken);
                                    // throw new Error(`Request failed with status: ${response.status}`);
                                }
                                return response.json();
                            })
                            .then((res) => {
                                if (res.results.length > 0) {
                                    const patientData = res.results[0];
                                    fetch(`https://${$window.location.hostname}:6062/api/v1/health-id/geo-code?upazillaCode=${patientData.present_address.upazila_id}&districtCode=${patientData.present_address.district_id}&divisionCode=${patientData.present_address.division_id}`)
                                        .then((response) => {
                                            if (!response.ok) {
                                                throw new Error(`Request failed with status: ${response.status}`);
                                            }
                                            return response.json();
                                        })
                                        .then((res) => {
                                            if (res) {
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
                                                var stateProvince = res.content.division;
                                                var countyDistrict = res.content.district;
                                                var upazila = res.content.upazilla;
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
                                                return patientCreate($scope.patient, jumpAccepted, spinnerToken);
                                            }
                                        });
                                } else {
                                    fetch(`https://${$window.location.hostname}:6062/api/v1/health-id/nid-verify`,
                                        {
                                            method: "POST",
                                            body: JSON.stringify(transformNIDData($scope.patient)),
                                            headers: {
                                                "Content-Type": "application/json"
                                            }
                                        }
                                    )
                                        .then((response) => {
                                            if (!response.ok) {
                                                $scope.patient.nationalId = 'Not Verified';
                                                return patientCreate($scope.patient, jumpAccepted, spinnerToken);
                                                // throw new Error(`Request failed with status: ${response.status}`);
                                            }
                                            return response.json();
                                        })
                                        .then((res) => {
                                            if (res.verifyToken) {
                                                const nidData = res;
                                                const HIDPayloadData = transformNidVerifyData($scope.patient, nidData);
                                                fetch(`https://${$window.location.hostname}:6062/api/v1/health-id`,
                                                    {
                                                        method: "POST",
                                                        body: JSON.stringify(HIDPayloadData),
                                                        headers: {
                                                            "Content-Type": "application/json"
                                                        }
                                                    }
                                                )
                                                    .then((response) => {
                                                        if (!response.ok) {
                                                            return patientCreate($scope.patient, jumpAccepted, spinnerToken);
                                                        }
                                                        return response.json();
                                                    })
                                                    .then((res) => {
                                                        if (res.statusCode === 201) {
                                                            $scope.patient.extraIdentifiers[0].identifier = res.content.id;
                                                            $scope.patient.extraIdentifiers[0].registrationNumber = res.content.id;
                                                            fetch(`https://${$window.location.hostname}:6062/api/v1/health-id/${res.content.id}`)
                                                                .then((response) => {
                                                                    if (!response.ok) {
                                                                        throw new Error(`Request failed with status: ${response.status}`);
                                                                    }
                                                                    return response.json();
                                                                })
                                                                .then((res) => {
                                                                    if (res.statusCode === 200) {
                                                                        const patientData = res.content;
                                                                        $scope.patient.givenName = patientData.given_name;
                                                                        $scope.patient.givenNameLocal = nidData.citizenData.fullName_Bangla;

                                                                        $scope.patient.familyName = patientData.sur_name;
                                                                        $scope.patient.gender = patientData.gender;

                                                                        $scope.patient.primaryRelative = nidData.citizenData.fatherName_English;
                                                                        $scope.patient.motherName = nidData.citizenData.motherName_English;
                                                                        $scope.patient.givenFatherNameLocal = nidData.citizenData.fatherName_Bangla;
                                                                        $scope.patient.givenMotherNameLocal = nidData.citizenData.motherName_Bangla;

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
                                                                        $scope.patient.nationalId = patientData.nid;
                                                                        $scope.patient.address.address1 = patientData.present_address.address_line;
                                                                        $scope.patient.address.display = patientData.present_address.address_line;
                                                                        $scope.patient.address.address5 = patientData.present_address.upazila_id;
                                                                        $scope.patient.address.countyDistrict = patientData.present_address.district_id;
                                                                        $scope.patient.address.stateProvince = patientData.present_address.division_id;

                                                                        return patientCreate($scope.patient, jumpAccepted, spinnerToken);
                                                                    }
                                                                })
                                                                .catch((error) => {
                                                                    console.error("Error:", error);
                                                                    return patientCreate($scope.patient, jumpAccepted, spinnerToken);
                                                                });
                                                        } else if (res.statusCode === 208) {
                                                            res.content.present_address.division = res.content.present_address.division_id;
                                                            res.content.present_address.district = res.content.present_address.district_id;
                                                            res.content.present_address.upazila = res.content.present_address.upazila_id;
                                                            localStorage.setItem("healthId", JSON.stringify(res.content));
                                                            const patientData = res.content;
                                                            $scope.patient.givenName = patientData.given_name;
                                                            $scope.patient.givenNameLocal = nidData.citizenData.fullName_Bangla;
                                                            $scope.patient.familyName = patientData.sur_name;
                                                            $scope.patient.gender = patientData.gender;
                                                            $scope.patient.primaryRelative = nidData.citizenData.fatherName_English;
                                                            $scope.patient.motherName = nidData.citizenData.motherName_English;
                                                            $scope.patient.givenFatherNameLocal = nidData.citizenData.fatherName_Bangla;
                                                            $scope.patient.givenMotherNameLocal = nidData.citizenData.motherName_Bangla;
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
                                                            return patientCreate($scope.patient, jumpAccepted, spinnerToken);
                                                        } else if (res.statusCode === 400) {
                                                            $scope.patient.nationalId = 'Not Verified';
                                                            return patientCreate($scope.patient, jumpAccepted, spinnerToken);
                                                        } else {
                                                            return patientCreate($scope.patient, jumpAccepted, spinnerToken);
                                                        }
                                                    })
                                                    .catch((error) => {
                                                        console.error("Error:", error);
                                                        return patientCreate($scope.patient, jumpAccepted, spinnerToken);
                                                        // errorMessage = 'There was an error';
                                                    });
                                            } else {
                                                $scope.patient.nationalId = 'Not Verified';
                                                $scope.patient.birthRegistrationId = 'Not Verified';
                                                return patientCreate($scope.patient, jumpAccepted, spinnerToken);
                                            }
                                        });
                                }
                            });
                        } else {
                            return patientCreate($scope.patient, jumpAccepted, spinnerToken);
                        }
                    })
                    .catch(err => {
                        console.log('caught it!', err);
                        return patientCreate($scope.patient, jumpAccepted, spinnerToken);
                    });
                const transformNIDData = (data) => {
                    return {
                        performer: $rootScope.currentUser.uuid,
                        nidOrBrn: data.nationalId ? data.nationalId : data.birthRegistrationId,
                        type: data.nationalId ? "nid" : "brn",
                        name: data.familyName ? `${data.givenName} ${data.familyName}` : `${data.givenName}`,
                        mobile: data.phoneNumber,
                        dob: convertToYYYYMMDD(data.birthdate)

                    };
                };
                const transformNidVerifyData = (data, nidInformation) => {
                    const nidData = nidInformation.citizenData;
                    // const userUuid = $rootScope.currentUser.uuid;
                    const isNationalIdPresent = data.nationalId;
                    return {
                        given_name: nidData.fullName_English,
                        sur_name: '',
                        date_of_birth: data.birthdate ? data.birthdate.toISOString().substring(0, 10) : null,
                        gender: nidData.gender === 1 ? 'M' : nidData.gender === 2 ? 'F' : 'O',
                        nid: isNationalIdPresent ? data.nationalId : '',
                        bin_brn: isNationalIdPresent ? '' : data.birthRegistrationId,
                        verifyToken: nidInformation.verifyToken,
                        phone_number: {
                            number: data.phoneNumber
                        },
                        present_address: {
                            address_line: nidData.presentHouseholdNoText ? nidData.presentHouseholdNoText : data.address.address1,
                            division_id: divisionId,
                            district_id: districtId,
                            upazila_id: upazilaId,
                            country_code: "050"
                        },
                        name_bangla: nidData.fullName_Bangla,
                        religion: null,
                        blood_group: null,
                        place_of_birth: null,
                        nationality: null,
                        marital_status: null,
                        primary_contact: null,
                        primary_contact_number: {
                            number: null
                        },
                        relations: [
                            { type: 'FTH', name_bangla: nidData.fatherName_Bangla, given_name: nidData.fatherName_English },
                            { type: 'MTH', name_bangla: nidData.motherName_Bangla, given_name: nidData.motherName_English }
                        ],
                        // permanent_address: {
                        //     address_line: nidData.permanentHouseholdNoText ? nidData.permanentHouseholdNoText : null,
                        //     // division_id: null,
                        //     // district_id: null,
                        //     // upazila_id: null,
                        //     city_corporation_id: null,
                        //     union_or_urban_ward_id: null,
                        //     rural_ward_id: null,
                        //     area_mouja: null,
                        //     village: null,
                        //     holding_number: null,
                        //     street: null,
                        //     post_office: null,
                        //     post_code: null,
                        //     country_code: '050'
                        // },
                        confidential: 'No'
                    };
                };
                const patientCreate = (patientData, jumpAccepted, spinnerToken) => {
                    return patientService.create(patientData, jumpAccepted).then(
                        function (response) {
                            copyPatientProfileDataToScope(response);
                        },
                        function (response) {
                            spinner.hide(spinnerToken);
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
                                        return exampleFunction(patientData, jumpAccepted);
                                    }
                                });
                            }
                            if (response.isIdentifierDuplicate) {
                                errorMessage = response.message;
                            }
                        }
                    );
                };
            };

            var createPatient = function (jumpAccepted) {
                localStorage.setItem('visitPage', 'true');
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
