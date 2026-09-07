'use strict';

angular.module('bahmni.home')
    .controller('EAppointmentController', ['$scope', '$http', '$window',
        function ($scope, $http, $window) {
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
            $scope.appointments = [];
            $scope.pagedAppointments = [];
            $scope.loading = false;
            $scope.searched = false;
            $scope.error = null;
            $scope.notice = null;
            $scope.busyAppointment = null;
            $scope.currentPage = 1;
            $scope.totalPages = 1;

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

            var applyPaging = function () {
                $scope.totalPages =
                    Math.max(1, Math.ceil($scope.appointments.length / PAGE_SIZE));
                if ($scope.currentPage > $scope.totalPages) {
                    $scope.currentPage = $scope.totalPages;
                }
                var start = ($scope.currentPage - 1) * PAGE_SIZE;
                $scope.pagedAppointments = $scope.appointments.slice(start, start + PAGE_SIZE);
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
                    applyPaging();
                }).catch(function (response) {
                    $scope.appointments = [];
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

            var post = function (appointment, suffix, onDone) {
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

            $scope.search();
        }]);
