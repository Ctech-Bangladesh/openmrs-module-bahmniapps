'use strict';

angular.module('bahmni.clinical')
    .controller('PatientDashboardNcdController', ['$scope', '$stateParams',
        function ($scope, $stateParams) {
            $scope.dashboardConfig = $scope.dashboard.getSectionByType("ncdHistory").dashboardConfig || {};
            $scope.dashboardConfig.patientUuid = $stateParams.patientUuid;

            $scope.dialogData = {
                "patient": $scope.patient,
                "expandedViewConfig": $scope.dashboard.getSectionByType("ncdHistory").expandedViewConfig || {}
            };
            $scope.patientUuid = $stateParams.patientUuid;
        }]);
