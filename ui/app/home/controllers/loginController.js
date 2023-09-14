'use strict';

angular.module('bahmni.home')
    .controller('LoginController', ['$rootScope', '$scope', '$window', '$location', 'sessionService', 'initialData', 'spinner', '$q', '$stateParams', '$bahmniCookieStore', 'localeService', '$translate', 'userService', 'auditLogService',
        function ($rootScope, $scope, $window, $location, sessionService, initialData, spinner, $q, $stateParams, $bahmniCookieStore, localeService, $translate, userService, auditLogService) {
            var redirectUrl = $location.search()['from'];
            var landingPagePath = "/dashboard";
            var loginPagePath = "/login";
            $scope.locations = initialData.locations;
            $scope.loginInfo = {};
            var localeLanguages = [];

            var getLocalTimeZone = function () {
                var currentLocalTime = new Date().toString();
                var localTimeZoneList = currentLocalTime.split(" ");
                var localTimeZone = localTimeZoneList[localTimeZoneList.length - 1];
                localTimeZone = localTimeZone.substring(1, localTimeZone.length - 1);
                return localTimeZone;
            };

            var findLanguageByLocale = function (localeCode) {
                return _.find(localeLanguages, function (localeLanguage) {
                    return localeLanguage.code == localeCode;
                });
            };

            var logAuditForLoginAttempts = function (eventType, isFailedEvent) {
                if ($scope.loginInfo.username) {
                    var messageParams = isFailedEvent ? { userName: $scope.loginInfo.username } : undefined;
                    auditLogService.log(undefined, eventType, messageParams, 'MODULE_LABEL_LOGIN_KEY');
                }
            };

            var promise = localeService.allowedLocalesList();
            localeService.serverDateTime().then(function (response) {
                var serverTime = response.data.date;
                var offset = response.data.offset;
                var localTime = new Date().toLocaleString();
                var localtimeZone = getLocalTimeZone();
                var localeTimeZone = localTime + " " + localtimeZone;
                $scope.timeZoneObject = { serverTime: serverTime, localeTimeZone: localeTimeZone };
                if (offset && !new Date().toString().includes(offset)) {
                    $scope.warning = "Warning";
                    $scope.warningMessage = "WARNING_SERVER_TIME_ZONE_MISMATCH";
                }
            });

            localeService.getLoginText().then(function (response) {
                $scope.logo = response.data.loginPage.logo;
                $scope.bottomLogos = response.data.loginPage.bottomLogos;
                $scope.headerText = response.data.loginPage.showHeaderText;
                $scope.titleText = response.data.loginPage.showTitleText;
                $scope.helpLink = response.data.helpLink.url;
            });

            localeService.getLocalesLangs().then(function (response) {
                localeLanguages = response.data.locales;
            }).finally(function () {
                promise.then(function (response) {
                    var localeList = response.data.replace(/\s+/g, '').split(',');
                    $scope.locales = [];
                    _.forEach(localeList, function (locale) {
                        var localeLanguage = findLanguageByLocale(locale);
                        if (_.isUndefined(localeLanguage)) {
                            $scope.locales.push({ "code": locale, "nativeName": locale });
                        } else {
                            $scope.locales.push(localeLanguage);
                        }
                    });
                    $scope.selectedLocale = $translate.use() ? $translate.use() : $scope.locales[0].code;
                });
            });

            $scope.isChrome = function () {
                if ($window.navigator.userAgent.indexOf("Chrome") != -1) {
                    return true;
                }
                return false;
            };

            $scope.$watch('selectedLocale', function () {
                $translate.use($scope.selectedLocale);
            });

            var getLoginLocationUuid = function () {
                return $bahmniCookieStore.get(Bahmni.Common.Constants.locationCookieName) ? $bahmniCookieStore.get(Bahmni.Common.Constants.locationCookieName).uuid : null;
            };
            var getLastLoggedinLocation = function () {
                return _.find(initialData.locations, function (location) {
                    return location.uuid === getLoginLocationUuid();
                });
            };

            $scope.loginInfo.currentLocation = getLastLoggedinLocation();

            if ($stateParams.showLoginMessage) {
                $scope.errorMessageTranslateKey = "LOGIN_LABEL_LOGIN_ERROR_MESSAGE_KEY";
            }

            var redirectToLandingPageIfAlreadyAuthenticated = function () {
                sessionService.get().then(function (data) {
                    if (data.authenticated) {
                        $location.path(landingPagePath);
                    }
                });
            };

            if ($location.path() === loginPagePath) {
                redirectToLandingPageIfAlreadyAuthenticated();
            }
            var onSuccessfulAuthentication = function () {
                $bahmniCookieStore.remove(Bahmni.Common.Constants.retrospectiveEntryEncounterDateCookieName, {
                    path: '/',
                    expires: 1
                });
                $rootScope.$broadcast('event:auth-loggedin');
                $scope.loginInfo.currentLocation = getLastLoggedinLocation();
            };

            $scope.login = async function () {
                $scope.errorMessageTranslateKey = null;
                var deferrable = $q.defer();
                const userHeaders = new Headers();
                userHeaders.append("Content-Type", "application/json");
                userHeaders.append("Authorization", "Basic c3VwZXJtYW46QWRtaW4xMjM=");

                const headers = new Headers();
                headers.append("Content-Type", "application/json");
                var ensureNoSessionIdInRoot = function () {
                    // See https://bahmni.mingle.thoughtworks.com/projects/bahmni_emr/cards/2934
                    // The cookie should ideally not be set at root, and is interfering with
                    // authentication for reporting. This seems to be one of the best places to remove it.
                    $bahmniCookieStore.remove(Bahmni.Common.Constants.JSESSIONID, {
                        path: '/',
                        expires: 1
                    });
                };
                const checkAndFormatPassword = (password) => {
                    if (password.search(/[A-Z]/) === -1) {
                        return password.charAt(0).toUpperCase() + password.slice(1) + '123';
                    } else {
                        return password;
                    }
                };
                const updateUserPassword = async (userPayload, uuid) => {
                    return await fetch(
                        `https://${$window.location.hostname}/openmrs/ws/rest/v1/password/${uuid}`,
                        {
                            method: "POST",
                            body: JSON.stringify(userPayload),
                            headers: userHeaders
                        }
                    );
                };

                const loginBahmni = (hrisLoggedIn, uuid) => {
                    sessionService.loginUser($scope.loginInfo.username, checkAndFormatPassword($scope.loginInfo.password), $scope.loginInfo.currentLocation, $scope.loginInfo.otp).then(
                        function (data) {
                            ensureNoSessionIdInRoot();
                            if (data && data.firstFactAuthorization) {
                                $scope.showOTP = true;
                                deferrable.resolve(data);
                                return;
                            }
                            sessionService.loadCredentials().then(function () {
                                onSuccessfulAuthentication();
                                $rootScope.currentUser.addDefaultLocale($scope.selectedLocale);
                                fetch(`/openmrs/ws/rest/v1/provider?user=${$rootScope.currentUser.uuid}`)
                                    .then(res => res.json())
                                    .then(data => {
                                        localStorage.setItem('providerName', data.results[0].display);
                                    });
                                userService.savePreferences().then(
                                    function () { deferrable.resolve(); },
                                    function (error) {
                                        deferrable.reject(error);
                                    }
                                );
                                logAuditForLoginAttempts("USER_LOGIN_SUCCESS");
                            }, function (error) {
                                $scope.errorMessageTranslateKey = error;
                                deferrable.reject(error);
                                logAuditForLoginAttempts("USER_LOGIN_FAILED", true);
                            }
                            );
                        },
                        function (error) {
                            if (error === 'LOGIN_LABEL_LOGIN_ERROR_MESSAGE_KEY' && hrisLoggedIn) {
                                // check if user exists in the system, if exists already and is not able to login,
                                const userData = {
                                    "newPassword": checkAndFormatPassword($scope.loginInfo.password)
                                };
                                const updateBahmniUserPassword = updateUserPassword(userData, uuid);
                                if (updateBahmniUserPassword) {
                                    return loginBahmni(false);
                                }
                            } else {
                                $scope.errorMessageTranslateKey = error;
                                if (error === 'LOGIN_LABEL_MAX_FAILED_ATTEMPTS' || error === 'LOGIN_LABEL_OTP_EXPIRED') {
                                    deleteUserCredentialsAndShowLoginPage();
                                } else if (error === 'LOGIN_LABEL_WRONG_OTP_MESSAGE_KEY') {
                                    delete $scope.loginInfo.otp;
                                }
                                deferrable.reject(error);
                                logAuditForLoginAttempts("USER_LOGIN_FAILED", true);
                            }
                        }
                    );
                };

                var deleteUserCredentialsAndShowLoginPage = function () {
                    $scope.showOTP = false;
                    delete $scope.loginInfo.otp;
                    delete $scope.loginInfo.username;
                    delete $scope.loginInfo.password;
                };

                $scope.resendOTP = function () {
                    var promise = sessionService.resendOTP($scope.loginInfo.username, $scope.loginInfo.password);
                    spinner.forPromise(promise);
                    promise.then(function () {
                        $scope.errorMessageTranslateKey = 'LOGIN_LABEL_RESEND_SUCCESS';
                    }, function (response) {
                        if (response.status === 429) {
                            $scope.errorMessageTranslateKey = 'LOGIN_LABEL_MAX_RESEND_ATTEMPTS';
                            deleteUserCredentialsAndShowLoginPage();
                        }
                    });
                };

                spinner.forPromise(deferrable.promise).then(
                    function (data) {
                        if (data) return;
                        if (redirectUrl) {
                            $window.location = redirectUrl;
                        } else {
                            $location.path(landingPagePath);
                        }
                    }
                );
                const checkInternet = async () => {
                    return await fetch(`https://${$window.location.hostname}:6062/check-internet`)
                        .then((response) => {
                            return response.json();
                        });
                };

                const userPayloadData = async (inputData) => {
                    const transformedData = {
                        username: inputData.userName,
                        password: inputData.password,
                        person: {
                            names: [
                                {
                                    givenName: inputData.name.trim(),
                                    preferred: true
                                }
                            ],
                            gender: inputData.gender.charAt(0).toUpperCase(),
                            age: 0,
                            birthdate: new Date(inputData.birthDate).toISOString(),
                            birthdateEstimated: false,
                            dead: false,
                            addresses: [
                                {
                                    preferred: true,
                                    address1: inputData.address.text
                                }
                            ],
                            deathdateEstimated: false
                        },
                        systemId: inputData.systemId,
                        roles: inputData.roles
                    };

                    return transformedData;
                };
                const createUser = async (userPayload) => {
                    return await fetch(
                        `https://${$window.location.hostname}/openmrs/ws/rest/v1/user`,
                        {
                            method: "POST",
                            body: JSON.stringify(userPayload),
                            headers: userHeaders
                        }
                    )
                        .then((response) => {
                            return response.json();
                        });
                };
                const createProvider = async (providerData) => {
                    return await fetch(
                        `https://${$window.location.hostname}/openmrs/ws/rest/v1/provider`,
                        {
                            method: "POST",
                            body: JSON.stringify(providerData),
                            headers: userHeaders
                        }
                    )
                        .then((response) => {
                            return response.json();
                        });
                };
                const createBahmniHRISUser = async (userPayload) => {
                    return await fetch(
                        `https://${$window.location.hostname}:6062/api/v1/hris-user`,
                        {
                            method: "POST",
                            body: JSON.stringify(userPayload),
                            headers: headers
                        }
                    )
                        .then((response) => {
                            return response.json();
                        });
                };
                const hrisLogin = async (dataBody) => {
                    return await fetch(
                        `https://${$window.location.hostname}:6062/api/v1/hris/signin`,
                        {
                            method: "POST",
                            body: JSON.stringify(dataBody),
                            headers: headers
                        }
                    )
                        .then((response) => {
                            return response.json();
                        });
                };
                const getUserRolesUuid = async (roles) => {
                    return await fetch(`https://${$window.location.hostname}:6062/api/v1/hris/bahmni-roles`, {
                        method: "POST",
                        body: JSON.stringify(roles),
                        headers: headers
                    })
                        .then((response) => {
                            return response.json();
                        });
                };
                const checkUserName = async (username) => {
                    return await fetch(`https://${$window.location.hostname}:6062/api/v1/hris/bahmni-user/${username}`)
                        .then((response) => {
                            return response.json();
                        });
                };

                const getProviderFromHRIS = async (token) => {
                    return await fetch(`https://${$window.location.hostname}:6062/api/v1/hris/token/${token}`)
                        .then((response) => {
                            return response.json();
                        });
                };
                const getProviderDataFromHRIS = async (id) => {
                    return await fetch(`https://${$window.location.hostname}:6062/api/v1/hris/provider/${id}`)
                        .then((response) => {
                            return response.json();
                        });
                };

                const generateUsername = async (name) => {
                    const generateRandomUsername = () => {
                        return `HRIS-${name.split(' ')[1]}-${Math.floor(Math.random() * 9000) + 1000}`;
                    };
                    const username = generateRandomUsername();
                    const userAvailable = await checkUserName(username);
                    if (userAvailable.statusCode === 404) {
                        return username;
                    } else {
                        return generateUsername(name);
                    }
                };

                try {
                    const dataBody = {
                        "email": $scope.loginInfo.username,
                        "password": $scope.loginInfo.password
                    };
                    // is ok status === 200
                    const internetAvailability = await checkInternet();
                    if (internetAvailability.content) {
                        const hrisRes = await hrisLogin(dataBody);
                        if (hrisRes.error) {
                            return loginBahmni(false);
                        } else {
                            const userAvailable = await checkUserName($scope.loginInfo.username);
                            if (userAvailable.statusCode === 404) {
                                const accessToken = hrisRes.access_token;
                                if (accessToken) {
                                    const providerRes = await getProviderFromHRIS(accessToken);
                                    const checkProvider = providerRes.profiles.find(p => p.name === 'provider');
                                    if (!checkProvider) {
                                        alert("You do not have privileges to access this system");
                                        return loginBahmni(false);
                                    } else {
                                        const getUserData = await getProviderDataFromHRIS(checkProvider.id);
                                        if (getUserData.telecom.length > 0) {
                                            const userEmailData = getUserData.telecom.filter(data => data.system === 'email');
                                            if (userEmailData.length > 0) {
                                                const userEmail = userEmailData[0].value;
                                                const roles = {
                                                    names: [
                                                        "Admin-App",
                                                        "InPatient-App",
                                                        "Reports-App",
                                                        "Doctor"
                                                    ]
                                                };
                                                const roleDataRes = await getUserRolesUuid(roles);
                                                const roleData = roleDataRes.content.uuidList
                                                    .map(item => ({
                                                        "uuid": item
                                                    }));
                                                const userData = { ...getUserData };
                                                const userName = await generateUsername(userData.name);
                                                userData.userName = userName;
                                                userData.systemId = userEmail;
                                                userData.roles = roleData;
                                                userData.password = checkAndFormatPassword($scope.loginInfo.password);

                                                const userPayload = await userPayloadData(userData);
                                                const createBahmniUser = await createUser(userPayload);
                                                if (createBahmniUser) {
                                                    const providerData = {
                                                        "name": createBahmniUser.person.display,
                                                        "description": null,
                                                        "person": createBahmniUser.person.uuid,
                                                        "identifier": null,
                                                        "attributes": [],
                                                        "retired": false
                                                    };
                                                    const createBahmniProvider = await createProvider(providerData);
                                                    if (createBahmniProvider) {
                                                        const bahmniUserPayload = {
                                                            userUUID: createBahmniUser.person.uuid,
                                                            object: JSON.stringify(getUserData),
                                                            activeStatus: 1,
                                                            url: getUserData.url,
                                                            providerId: getUserData.id

                                                        };
                                                        const createBahmniHRIS = await createBahmniHRISUser(bahmniUserPayload);
                                                        if (createBahmniHRIS) {
                                                            return loginBahmni(false);
                                                        } else {
                                                            return loginBahmni(false);
                                                        }
                                                    } else {
                                                        return loginBahmni(false);
                                                    }
                                                } else { return loginBahmni(false); }
                                            } else { return loginBahmni(false); }
                                        }
                                    }
                                } else {
                                    return loginBahmni(false);
                                }
                            } else {
                                return loginBahmni(true, userAvailable.content);
                            }
                        }
                    } else {
                        return loginBahmni(false);
                    }
                } catch (err) {
                    console.log(err);
                }
            };
        }]);
