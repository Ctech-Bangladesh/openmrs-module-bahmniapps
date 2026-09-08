'use strict';

angular.module('bahmni.home')
    .controller('EAppointmentController', ['$scope', '$http', '$window', '$rootScope',
        function ($scope, $http, $window, $rootScope) {
            // Same-origin path, reverse-proxied by Apache to support-util on loopback:6061.
            // Using the existing 443 listener means no extra firewall port, no CORS, and the
            // backend stays unreachable from the network. The DGHS base URLs, the HRIS access
            // token and the HRIS password all remain server-side.
            var baseUrl = '/support-util/api/v1/dghs/appointments';

            var PAGE_SIZE = 20;

            // AngularJS 1.4.9 binds input[type="date"] to a Date OBJECT. Assigning a string
            // throws [ngModel:datefmt], so the model always holds Dates.
            var startOfToday = function () {
                var d = new Date();
                return new Date(d.getFullYear(), d.getMonth(), d.getDate());
            };

            // Backend takes ISO yyyy-MM-dd and converts to DGHS dd-MM-yyyy server-side, so we
            // never depend on browser locale formatting.
            var toIso = function (date) {
                if (!(date instanceof Date) || isNaN(date.getTime())) {
                    return null;
                }
                return date.getFullYear()
                    + '-' + ('0' + (date.getMonth() + 1)).slice(-2)
                    + '-' + ('0' + date.getDate()).slice(-2);
            };

            $scope.fromDate = startOfToday();
            $scope.toDate = startOfToday();
            $scope.appointments = [];      // everything returned for the date range
            $scope.filtered = [];          // after the patient search
            $scope.pagedAppointments = []; // the page currently rendered
            // Object wrapper, not a primitive: the search input lives inside an ng-if, which
            // creates a CHILD SCOPE. Binding ng-model to a primitive there writes to the child
            // and shadows the parent, so the controller never sees what the user typed. Binding
            // to search.text writes through the prototype chain to this same object.
            $scope.patientFilter = {text: ''};
            $scope.loading = false;
            $scope.searched = false;
            $scope.error = null;
            $scope.notice = null;
            $scope.busyAppointment = null;
            $scope.currentPage = 1;
            $scope.totalPages = 1;

            // OPD Consultation Room selection. The room list comes from the SAME endpoint the
            // Registration "Room To Assign" form uses to populate its dropdown, so eAppointment
            // shows exactly the same rooms. No separate room-management implementation.
            var ROOM_LIST_URL = '/openmrs/module/bahmnicustomutil/getLocationBylocationTagNameAndLoginLocation.form'
                + '?locationTagName=OpdConsultationRoom&loginLocation=OPD';

            $scope.roomModal = {
                open: false,
                appointment: null,
                rooms: [],
                selectedId: null,
                loading: false,
                error: null,
                submitting: false
            };

            // Provider uuid of the logged-in doctor. The encounter must be attributed to them,
            // not to a service account, or the provider-keyed search
            // (emrapi.sqlSearch.activePatientsByProvider, filtering pr.uuid = ${provider_uuid})
            // will never return the patient for that doctor - and every doctor would otherwise
            // see everyone's patients. Resolved exactly as Bahmni's own auth does, via
            // /openmrs/ws/rest/v1/provider?user=<userUuid>.
            var providerUuid = null;

            var resolveProviderUuid = function () {
                if (providerUuid) {
                    return;
                }
                // Fast path: the app framework resolved it at login (appService.initApp ->
                // sessionService.loadProviders), exactly as Registration and Clinical rely on.
                if ($rootScope.currentProvider && $rootScope.currentProvider.uuid) {
                    providerUuid = $rootScope.currentProvider.uuid;
                    return;
                }
                // Slow path, for a direct hit on #/eAppointment before the framework has run:
                // ask OpenMRS who the session belongs to, then look their provider up the same
                // way sessionService.loadProviders does.
                var fromUser = function (userUuid) {
                    return $http.get(Bahmni.Common.Constants.providerUrl, {
                        method: 'GET',
                        params: {user: userUuid},
                        cache: false
                    }).then(function (response) {
                        var results = (response.data && response.data.results) || [];
                        if (results.length) {
                            providerUuid = results[0].uuid;
                            $rootScope.currentProvider = {uuid: providerUuid};
                        }
                    });
                };

                if ($rootScope.currentUser && $rootScope.currentUser.uuid) {
                    fromUser($rootScope.currentUser.uuid).catch(angular.noop);
                    return;
                }

                $http.get(Bahmni.Common.Constants.RESTWS_V1 + '/session', {cache: false})
                    .then(function (response) {
                        var user = response.data && response.data.user;
                        if (user && user.uuid) {
                            return fromUser(user.uuid);
                        }
                    }).catch(angular.noop);
                // Left null on failure: the backend then falls back to its configured service
                // provider, so the room assignment still succeeds - just not attributed to this
                // doctor, and the UI surfaces nothing misleading.
            };

            $scope.openRoomModal = function (appointment) {
                if ($scope.busyAppointment) { return; }
                $scope.error = null;
                $scope.notice = null;
                resolveProviderUuid();   // refresh in case login completed after page load
                var m = $scope.roomModal;
                m.open = true;
                m.appointment = appointment;
                m.selectedId = null;
                m.error = null;
                m.submitting = false;
                m.loading = true;

                $http.get(ROOM_LIST_URL, {withCredentials: true}).then(function (response) {
                    m.rooms = (response.data && response.data.results) || [];
                    if (m.rooms.length === 0) {
                        m.error = 'No OPD Consultation Room is configured for this location.';
                    }
                }).catch(function () {
                    m.rooms = [];
                    m.error = 'Could not load the OPD Consultation Room list.';
                }).finally(function () {
                    m.loading = false;
                });
            };

            $scope.closeRoomModal = function () {
                $scope.roomModal.open = false;
                $scope.roomModal.appointment = null;
            };

            // Submit completes the Visited workflow. Nothing is submitted until a room is chosen.
            $scope.submitRoom = function () {
                var m = $scope.roomModal;
                if (m.submitting) {
                    return;
                }
                if (!m.selectedId) {
                    m.error = 'Please select an OPD Consultation Room.';
                    return;
                }
                m.error = null;
                m.submitting = true;
                var appointment = m.appointment;
                var suffix = '/visited?roomLocationId=' + encodeURIComponent(m.selectedId);
                if (providerUuid) {
                    suffix += '&providerUuid=' + encodeURIComponent(providerUuid);
                }
                post(appointment, suffix,
                    function (updated) {
                        $scope.closeRoomModal();
                        if (updated.callbackStatus === 'FAILED') {
                            $scope.error = 'Appointment marked as Visited locally, but DGHS '
                                + 'synchronization failed. Please retry synchronization.';
                        } else {
                            $scope.notice = 'Visited successfully.';
                        }
                    },
                    function () {
                        m.submitting = false;
                    });
            };

            var errorText = function (response, fallback) {
                if (response && response.data && response.data.message) {
                    return response.data.message;
                }
                if (response && response.status === 0) {
                    return 'Cannot reach the support-util backend. Please check that the '
                        + 'support-util service is running on the server.';
                }
                if (response && response.status === 401) {
                    return 'You are not authorised. Please log in again.';
                }
                return fallback;
            };

            // Phone numbers arrive in varying shapes (spaces, dashes, +88 prefix), so both the
            // query and the stored value are reduced to digits before comparing.
            var digitsOnly = function (value) {
                return (value || '').replace(/\D/g, '');
            };

            var matches = function (appointment, term) {
                var lower = term.toLowerCase();
                var name = (appointment.patientName || '').toLowerCase();
                var nameBn = (appointment.patientNameBn || '');
                var healthId = (appointment.patientHealthId || '').toLowerCase();
                var nid = (appointment.patientNidBrn || '').toLowerCase();

                if (name.indexOf(lower) !== -1) { return true; }
                if (nameBn.indexOf(term) !== -1) { return true; }   // Bangla: no case folding
                if (healthId.indexOf(lower) !== -1) { return true; }
                if (nid.indexOf(lower) !== -1) { return true; }

                var queryDigits = digitsOnly(term);
                if (queryDigits && digitsOnly(appointment.patientPhone).indexOf(queryDigits) !== -1) {
                    return true;
                }
                return false;
            };

            // Search runs over every record loaded for the date range, not just the visible page,
            // because the backend returns the whole range in one response and paging is local.
            var applyFilter = function () {
                var term = ($scope.patientFilter.text || '').trim();
                if (!term) {
                    $scope.filtered = $scope.appointments;
                } else {
                    $scope.filtered = $scope.appointments.filter(function (appointment) {
                        return matches(appointment, term);
                    });
                }
            };

            var applyPaging = function () {
                $scope.totalPages =
                    Math.max(1, Math.ceil($scope.filtered.length / PAGE_SIZE));
                if ($scope.currentPage > $scope.totalPages) {
                    $scope.currentPage = $scope.totalPages;
                }
                var start = ($scope.currentPage - 1) * PAGE_SIZE;
                $scope.pagedAppointments = $scope.filtered.slice(start, start + PAGE_SIZE);
            };

            // Called on every keystroke; filtering resets to page 1 so results are never hidden
            // behind a page number left over from the previous result set.
            $scope.onSearchChanged = function () {
                applyFilter();
                $scope.currentPage = 1;
                applyPaging();
            };

            $scope.clearSearch = function () {
                $scope.patientFilter.text = '';
                $scope.onSearchChanged();
            };

            $scope.goToPage = function (page) {
                if (page < 1 || page > $scope.totalPages) {
                    return;
                }
                $scope.currentPage = page;
                applyPaging();
            };

            var validRange = function () {
                if (!toIso($scope.fromDate) || !toIso($scope.toDate)) {
                    $scope.error = 'Please provide both From and To dates.';
                    return false;
                }
                if ($scope.fromDate.getTime() > $scope.toDate.getTime()) {
                    $scope.error = 'From date cannot be after To date.';
                    return false;
                }
                return true;
            };

            $scope.search = function () {
                $scope.error = null;
                $scope.notice = null;
                if (!validRange()) {
                    return;
                }
                $scope.loading = true;
                $http.get(baseUrl, {
                    params: {fromDate: toIso($scope.fromDate), toDate: toIso($scope.toDate)},
                    withCredentials: true
                }).then(function (response) {
                    $scope.appointments = (response.data && response.data.content) || [];
                    $scope.currentPage = 1;
                    applyFilter();   // keep any active patient search applied to the new results
                    applyPaging();
                }).catch(function (response) {
                    $scope.appointments = [];
                    applyFilter();
                    applyPaging();
                    $scope.error = errorText(response, 'Could not load appointments.');
                }).finally(function () {
                    $scope.loading = false;
                    $scope.searched = true;
                });
            };

            $scope.reset = function () {
                $scope.fromDate = startOfToday();
                $scope.toDate = startOfToday();
                $scope.patientFilter.text = '';   // Reset returns the full list, not a filtered one
                $scope.error = null;
                $scope.notice = null;
                $scope.search();
            };

            // The authoritative status is the backend's syncStatus/callbackStatus, never a
            // frontend-only flag.
            $scope.statusLabel = function (appointment) {
                if ($scope.busyAppointment === appointment.externalAppointmentId) {
                    return 'Processing...';
                }
                if (appointment.syncStatus === 'VISITED') {
                    return appointment.callbackStatus === 'FAILED' ? 'Callback Failed' : 'Visited';
                }
                if (appointment.syncStatus === 'FAILED') {
                    return 'Error';
                }
                return 'Booked';
            };

            $scope.statusClass = function (appointment) {
                var label = $scope.statusLabel(appointment);
                if (label === 'Visited') { return 'eapp-badge eapp-badge-visited'; }
                if (label === 'Callback Failed') { return 'eapp-badge eapp-badge-warn'; }
                if (label === 'Error') { return 'eapp-badge eapp-badge-error'; }
                if (label === 'Processing...') { return 'eapp-badge eapp-badge-busy'; }
                return 'eapp-badge eapp-badge-booked';
            };

            $scope.isVisited = function (appointment) {
                return appointment.syncStatus === 'VISITED';
            };

            $scope.canMarkVisited = function (appointment) {
                return !$scope.isVisited(appointment) && !$scope.busyAppointment;
            };

            $scope.canRetryCallback = function (appointment) {
                return $scope.isVisited(appointment)
                    && appointment.callbackStatus === 'FAILED'
                    && !$scope.busyAppointment;
            };

            var post = function (appointment, suffix, onDone, onError) {
                if ($scope.busyAppointment) {   // guards against double submission
                    return;
                }
                $scope.error = null;
                $scope.notice = null;
                $scope.busyAppointment = appointment.externalAppointmentId;

                $http.post(baseUrl + '/' + appointment.externalAppointmentId + suffix, {},
                    {withCredentials: true})
                    .then(function (response) {
                        var updated = response.data && response.data.content;
                        if (updated) {
                            angular.extend(appointment, updated);   // authoritative backend state
                        }
                        onDone(appointment);
                    }).catch(function (response) {
                        $scope.error = errorText(response, 'The operation could not be completed.');
                        if (onError) {
                            onError(response);   // lets the room modal re-enable its Submit button
                        }
                    }).finally(function () {
                        $scope.busyAppointment = null;
                    });
            };

            $scope.markVisited = function (appointment) {
                post(appointment, '/visited', function (updated) {
                    if (updated.callbackStatus === 'FAILED') {
                        $scope.error = 'Appointment marked as Visited locally, but DGHS '
                            + 'synchronization failed. Please retry synchronization.';
                    } else {
                        $scope.notice = 'Visited successfully.';
                    }
                });
            };

            $scope.retryCallback = function (appointment) {
                post(appointment, '/retry-callback', function (updated) {
                    if (updated.callbackStatus === 'FAILED') {
                        $scope.error = 'DGHS synchronization still failing. '
                            + 'The local Visited state is kept; you can retry again.';
                    } else {
                        $scope.notice = 'DGHS synchronization completed.';
                    }
                });
            };

            resolveProviderUuid();   // resolve the logged-in doctor up front
            $scope.search();
        }]);
