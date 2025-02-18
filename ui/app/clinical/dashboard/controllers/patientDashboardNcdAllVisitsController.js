'use strict';

angular.module('bahmni.clinical')
    .controller('PatientDashboardNcdAllVisitsController', ['$scope', '$state', '$stateParams', '$window', '$http',
        function ($scope, $state, $stateParams, $window, $http) {
            $scope.patient = $scope.ngDialogData.patient;
            $scope.noOfVisits = $scope.ngDialogData.noOfVisits;
            var sectionConfig = $scope.ngDialogData.sectionConfig;
            $scope.patientUuid = $stateParams.patientUuid;
            var hostName = $window.location.hostname;
            var baseUrl = "https://" + hostName + "/openmrs/ws/rest/v1/uhcncd";
            var defaultParams = {
                maximumNoOfVisits: $scope.noOfVisits ? $scope.noOfVisits : 0
            };
            $scope.getAllNcdVisits = function (patientUuid) {
                $scope.ncdAllVisits = [];
                $http({
                    method: 'GET',
                    url: baseUrl + '/patient/getPatientVisitNcdDetails.htm?patientId=0&patientUuid=' + patientUuid,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': "Basic YWRtaW46dGVzdA=="
                    }
                }).then(function (response) {
                    $scope.ncdAllVisits = response.data.content;
                });
            };
            var init = function () {
                $scope.getAllNcdVisits($stateParams.patientUuid);
            };
            $scope.initialization = init();
        }]);
