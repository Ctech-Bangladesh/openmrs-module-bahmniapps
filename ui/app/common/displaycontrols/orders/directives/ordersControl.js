'use strict';

angular.module('bahmni.common.displaycontrol.orders')
    .directive('ordersControl', ['orderService', '$window', '$timeout', '$http', 'orderTypeService', '$q', 'spinner', '$filter',
        function (orderService, $window, $timeout, $http, orderTypeService, $q, spinner, $filter) {
            var controller = function ($scope) {
                $scope.orderTypeUuid = orderTypeService.getOrderTypeUuid($scope.orderType);
                if ($scope.config.showHeader === null || $scope.config.showHeader === undefined) {
                    $scope.config.showHeader = true;
                }

                var includeAllObs = true;
                var getOrders = function () {
                    var params = {
                        patientUuid: $scope.patient.uuid,
                        orderTypeUuid: $scope.orderTypeUuid,
                        conceptNames: $scope.config.conceptNames,
                        includeObs: includeAllObs,
                        numberOfVisits: $scope.config.numberOfVisits,
                        obsIgnoreList: $scope.config.obsIgnoreList,
                        visitUuid: $scope.visitUuid,
                        orderUuid: $scope.orderUuid
                    };
                    return orderService.getOrders(params).then(function (response) {
                        $scope.bahmniOrders = response.data;
                    });
                };
                var init = function () {
                    return getOrders().then(function () {
                        _.forEach($scope.bahmniOrders, function (order) {
                            if (order.bahmniObservations.length === 0) {
                                order.hideIfEmpty = true;
                            }
                        });
                        if (_.isEmpty($scope.bahmniOrders)) {
                            $scope.noOrdersMessage = $scope.getSectionTitle();
                        } else {
                            $scope.bahmniOrders[0].isOpen = true;
                        }
                        function matchStrings (str1, str2) {
                            const cleanStr1 = str1.toLowerCase().replace(/[\s,.-]/g, '');
                            const cleanStr2 = str2.toLowerCase().replace(/[\s,.-]/g, '');
                            return cleanStr1.includes(cleanStr2) || cleanStr2.includes(cleanStr1);
                        }
                        let orderData = $scope.bahmniOrders;
                        let apiUrl = `https://${$window.location.hostname}:5555/public/patient/identifiers/${$scope.patient.identifier}`;
                        $http.get(apiUrl)
                            .then(function (res) {
                                const labResult = res.data;
                                if (labResult.length > 0) {
                                    const groupTestResult = labResult.map(data => data.groupTestResults).reduce((acc, currentArray) => acc.concat(currentArray), []);
                                    const singleTestResult = labResult.map(data => data.singleTestResults).reduce((acc, currentArray) => acc.concat(currentArray), []);
                                    const resultArray = orderData.map(item1 => {
                                        const matchingItem2 = groupTestResult.find(item2 => matchStrings(item1.concept.name, item2.groupTest.groupTestName));
                                        if (matchingItem2) {
                                            return {
                                                ...item1,
                                                result: matchingItem2.singleTestResults.filter(data => data.result !== "")
                                            };
                                        } else {
                                            const matchingItem3 = singleTestResult.find(item2 => matchStrings(item1.concept.name, item2.test.testName) && item2.result !== "");
                                            if (matchingItem3) {
                                                return {
                                                    ...item1,
                                                    result: [matchingItem3]
                                                };
                                            } else {
                                                return {
                                                    ...item1,
                                                    result: []
                                                };
                                            }
                                        }
                                    });
                                    $timeout(function () { $scope.orderResult = resultArray; }, 100);
                                }
                                else {
                                    const resultArray = orderData.map(item1 => {
                                        return {
                                            ...item1,
                                            result: []
                                        };
                                    });
                                    $timeout(function () { $scope.orderResult = resultArray; }, 100);
                                }
                            });
                    });
                };
                $scope.getTitle = function (order) {
                    return order.conceptName + " on " + $filter('bahmniDateTime')(order.orderDate) + " by " + order.provider;
                };

                $scope.toggle = function (element) {
                    element.isOpen = !element.isOpen;
                };

                $scope.dialogData = {
                    "patient": $scope.patient,
                    "section": $scope.section
                };

                $scope.isClickable = function () {
                    return $scope.isOnDashboard && $scope.section.expandedViewConfig;
                };

                $scope.hasTitleToBeShown = function () {
                    return !$scope.isClickable() && $scope.getSectionTitle();
                };

                $scope.message = Bahmni.Common.Constants.messageForNoFulfillment;

                $scope.getSectionTitle = function () {
                    return $filter('titleTranslate')($scope.section);
                };
                $scope.initialization = init();
            };

            var link = function ($scope, element) {
                spinner.forPromise($scope.initialization, element);
            };

            return {
                restrict: 'E',
                controller: controller,
                link: link,
                templateUrl: "../common/displaycontrols/orders/views/ordersControl.html",
                scope: {
                    patient: "=",
                    section: "=",
                    orderType: "=",
                    orderUuid: "=",
                    config: "=",
                    isOnDashboard: "=",
                    visitUuid: "="
                }
            };
        }]);
