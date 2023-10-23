sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/dm/dme/browse/StorageLocationBrowse",
    "sap/dm/dme/formatter/NumberFormatter",
    "sap/dm/dme/formatter/DateTimeUtils",
    "sap/dm/dme/types/PlantDateType",
    "sap/dm/dme/model/AjaxUtil",
    "sap/ui/core/Fragment",
    "sap/dm/dme/message/ErrorHandler",
    "sap/dm/dme/i18n/i18nBundles",
    "sap/dm/dme/browse/BatchControl",
    "sap/dm/dme/controller/PrintingLabelDialog.controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/format/DateFormat",
    "sap/dm/dme/util/PlantSettings",
    "sap/dm/dme/controller/FormulaCalculateDialog.controller",
    "sap/dm/dme/controller/FormulaCalculatedInfo.controller"
], function(JSONModel, StorageLocationBrowse, NumberFormatter, DateTimeUtils, PlantDateType, AjaxUtil, Fragment, ErrorHandler, Bundles, BatchControl, PrintingLabelDialog,
    MessageToast, MessageBox, DateFormat, PlantSettings, FormulaCalculateDialog, FormulaCalculatedInfo) {
    "use strict";
    let nIntLength = 10;
    let nDecimalPlaces = 3;
    let sHandlingUnitNumberProperty = "/handlingUnitNumber";
    let sIsEwmManagedStorageLocationProperty = "/isEwmManagedStorageLocation";
    let sBatchNumberProperty = "/batchNumber";
    let sQuantityToleranceCheckProperty = "/quantityToleranceCheck";
    let sRecalculationEnabledProperty = "/recalculationEnabled";
    let sFormulaProperty = "/formula";
    let POSTING_CUMSTOM_FIELD = "customDataField";
    let POST_CUSTOM_FIELD_ID = "customField1";

    const oDecimalConstraints = NumberFormatter.dmcLocaleDecimalConstraints();
    oDecimalConstraints.scale = 3;
    oDecimalConstraints.minimum = '0.001';
    oDecimalConstraints.nullable = false;
    return {
        types: {
            quantity: new sap.ui.model.odata.type.Decimal({
                strictGroupingValidation: true
            }, oDecimalConstraints),
            plantdate: new PlantDateType()
        },
        oBatchControl: BatchControl,
        oDateTimeUtils: DateTimeUtils,
        oNumberFormatter: NumberFormatter,
        oPrintingLabelDialog: PrintingLabelDialog,
        setController: function(sController) {
            this.oController = sController;
        },

        setSelectedOrderData: function(oData) {
            this.selectedOrderData = oData;
            this.getShopOrderData(oData.orderRef);
        },

        onInitGoodsReceiptDialog: function() {
            if (!this.postData) {
                // Goods Receipt Post model
                this.postData = {
                    "shopOrder": "",
                    "batchId": "",
                    "material": "",
                    "materialVersion": "",
                    "batchNumber": "",
                    "storageLocation": "",
                    "workCenter": "",
                    "quantityToleranceCheck": true,
                    "quantity": {
                        "value": "",
                        "unitOfMeasure": {
                            "uom": "",
                            "shortText": "",
                            "longText": ""
                        }
                    },
                    "receivedQuantity": {
                        "value": "",
                        "unitOfMeasure": {
                            "uom": "",
                            "shortText": "",
                            "longText": ""
                        }
                    },
                    "targetQuantity": {
                        "value": "",
                        "unitOfMeasure": {
                            "uom": "",
                            "shortText": "",
                            "longText": ""
                        }
                    },
                    "isFinalConfirmation": "",
                    "userId": "",
                    "dateTime": "",
                    "comments": "",
                    "handlingUnitNumber": ""
                };
            }
            let oGrModel = new JSONModel(this.postData);
            this.oController.getView().setModel(oGrModel, "postModel");

            let oSettingsModel = new JSONModel();
            oSettingsModel.setData({
                grConfirmBtnEnable: false
            });
            this.oController.getView().setModel(oSettingsModel, "settingsModel");

            this.isCustomFieldValid = true;
            this.oController.getView().setModel(new JSONModel({
                dmcDateTimePickerValueFormat: DateTimeUtils.dmcDateValueFormat()
            }), "dmcDateTimePickerValueFormatModel");
        },

        concatenateQuantityAndUnitOfMeasure: function(sQty, sUom) {
            let sFormattedQty = NumberFormatter.dmcLocaleFloatNumberFormatter(sQty, sUom);
            if (sUom && sFormattedQty !== "") {
                return sFormattedQty + " " + sUom;
            } else if (sFormattedQty === "") {
                return "";
            } else {
                return sFormattedQty || "0";
            }
        },

        formatCancellationStatus: function(sStatusKey) {
            const sPostedKey = "enum.status.posted";
            const sCanceledkey = "enum.status.canceled";
            let oStatus = {
                POSTED_IN_DMC: sPostedKey,
                POSTED_TO_TARGET_SYS: sPostedKey,
                FAILED_TO_POST_TO_TARGET_SYS: sPostedKey,
                CANCELLATION_POSTED_IN_DMC: sCanceledkey,
                CANCELLATION_POSTED_TO_TARGET_SYS: sCanceledkey,
                CANCELLATION_FAILED_TO_POST_TO_TARGET_SYS: sCanceledkey,
            };
            const sKey = oStatus[sStatusKey] || "enum.status.notApplicable";
            return Bundles.getGoodreceiptText(sKey);
        },

        _updateSettingModel: function(bGrConfirmBtnEnable) {
            let oSettingsModel = this.oController.getView().getModel("settingsModel");
            oSettingsModel.setProperty("/grConfirmBtnEnable", bGrConfirmBtnEnable);
        },
        /**
         * @param {*} oData
         * oData contains keys:
         *      shopOrder
         *      materialref
         *      sfc
         *
         */
        showGRPostingsDialogs: function(oData) {
            let oView = this.oController.getView();
            if (!this.oController.byId("postingsDialog")) {
                Fragment.load({
                    id: oView.getId(),
                    name: "sap.dm.dme.fragment.GRPostingsDialog",
                    controller: this.oController
                }).then(function(oDialog) {
                    oView.addDependent(oDialog);
                    oDialog.open();
                    this.oController.byId("postingsTable").setBusy(true);
                    this.fetchGrPostDetails(oData);
                }.bind(this));
            } else {
                this.oController.byId("postingsDialog").open();
                this.oController.byId("postingsTable").setBusy(true);
                this.fetchGrPostDetails(oData);
            }
        },

        onFormulaCalculateIconPress: function(oEvent) {
            let oSource = oEvent.getSource();
            let sPath = oSource.getParent().getParent().getParent().getBindingContextPath();
            let oCalculatedResult = oSource.getModel("postingsModel").getObject(sPath).calculatedData;

            FormulaCalculatedInfo.openPopover(this.getOwnerComponent(), this.getView(), oSource, oCalculatedResult);
        },

        /***
         * Post Button pressed
         */
        showGoodsReceiptDialog: function(oData, fnPostSuccesscallback) {
            this.oGrpController = this;
            this.plantTimeZoneId = oData.plantTimeZoneId;
            this._fnPostSuccesscallback = fnPostSuccesscallback;
            this.onInitGoodsReceiptDialog();
            let oView = this.oController.getView();
            let selectedMaterial = oData.material;
            let selectedReceivedQuantityValue = oData.receivedQuantityValue;
            let selectedTargetQuantityValue = oData.targetQuantityValue;
            let selectedMaterialVersion = oData.version;
            let selectedBatchID = oData.batchNumber;
            let selectedStorageLocation = oData.storageLocation;
            let selectedUom = oData.uom;
            let loggedInUser = oData.loggedInUser;
            let isBatchManaged = oData.isBatchManaged;
            let isEwmManagedStorageLocation = oData.isEwmManagedStorageLocation;

            this.fetchMaterialUoms(selectedMaterial, selectedMaterialVersion);

            // Set the default values
            let oPostModel = oView.getModel("postModel");
            oPostModel.setProperty("/material", selectedMaterial);
            oPostModel.setProperty("/materialVersion", selectedMaterialVersion);
            oPostModel.setProperty("/receivedQuantity/value", selectedReceivedQuantityValue);
            oPostModel.setProperty("/receivedQuantity/unitOfMeasure/uom", selectedUom);
            oPostModel.setProperty("/targetQuantity/value", selectedTargetQuantityValue);
            oPostModel.setProperty("/targetQuantity/unitOfMeasure/uom", selectedUom);
            oPostModel.setProperty(sBatchNumberProperty, selectedBatchID);
            oPostModel.setProperty("/storageLocation", selectedStorageLocation);
            oPostModel.setProperty("/quantity/unitOfMeasure/uom", selectedUom);
            oPostModel.setProperty("/shopOrder", this.selectedOrderData.order);
            oPostModel.setProperty("/batchId", this.selectedOrderData.sfc);
            oPostModel.setProperty("/userId", loggedInUser);
            oPostModel.setProperty("/workCenter", this.selectedOrderData.workcenter);
            oPostModel.setProperty("/batchManaged", isBatchManaged);
            oPostModel.setProperty(sIsEwmManagedStorageLocationProperty, isEwmManagedStorageLocation);
            oPostModel.setProperty(sHandlingUnitNumberProperty, null); // if isEwmManagedStorageLocation is true, then show handlingUnitNumber field

            if (!this.oController.byId("postDialog")) {
                Fragment.load({
                    id: oView.getId(),
                    name: "sap.dm.dme.fragment.GRPostDialog",
                    controller: this.oController
                }).then(function(oDialog) {
                    oView.addDependent(oDialog);
                    this._createPostDialogCustomField();
                    oDialog.open();
                    this._grDialogOpenCallBack(oData.type);
                }.bind(this));
            } else {
                this.oController.byId("postDialog").open();
                this._grDialogOpenCallBack(oData.type);
            }
        },

        _grDialogOpenCallBack: function(sType) {
            let oView = this.oController.getView();
            let oPostModel = oView.getModel("postModel");
            oPostModel.setProperty("/dateTime", this.getCurrentDateInPlantTimeZone());

            if (sType === "N") {
                //only get propose batch number for finish goods
                this._getProposeBatchNumber();
            }
        },

        _getProposeBatchNumber: function() {
            let grController = this.GRPostController || this;
            let mainController = grController.oController;
            let inventoryUrl = mainController.getInventoryDataSourceUri();
            let sUrl = inventoryUrl + "batches/getProposedBatchNumber";
            let oPayload = {
                shopOrder: grController.postData.shopOrder,
                sfc: grController.postData.batchId,
                material: grController.postData.material,
                materialVersion: grController.postData.materialVersion
            };
            $.ajaxSettings.async = false;
            AjaxUtil.get(sUrl, oPayload, this._getProposeBatchNumberSuccessCallback.bind(this),
                this._getProposeBatchNumberErrorCallback.bind(this));
            $.ajaxSettings.async = true;
        },

        _getProposeBatchNumberSuccessCallback: function(oResponseData) {
            let oView = this.oController.getView();
            let oPostModel = oView.getModel("postModel");
            oPostModel.setProperty(sBatchNumberProperty, oResponseData.batchNumber);
        },

        _getProposeBatchNumberErrorCallback: function(oError, oHttpErrorMessage) {
            let err = oError || oHttpErrorMessage;
            let oView = this.oController.getView();
            let oPostModel = oView.getModel("postModel");
            this.oController.showErrorMessage(err, true, true);
            oPostModel.setProperty(sBatchNumberProperty, null);
        },

        _createPostDialogCustomField: function() {
            if (this.oController.oPluginConfiguration && this.oController.oPluginConfiguration.customField1) {
                let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
                let oPluginConfiguration = this.oController.oPluginConfiguration;
                let customFieldLabel1 = new sap.m.Label("customFieldLabel1", {
                    text: oPluginConfiguration.customField1
                });
                let customFieldValue1 = new sap.m.Input(POST_CUSTOM_FIELD_ID, {
                    value: "",
                    valueLiveUpdate: true,
                    liveChange: grController.onCustomFieldLiveChange.bind(grController)
                });
                this.oController.byId("postGoodsReceiptForm").addContent(customFieldLabel1);
                this.oController.byId("postGoodsReceiptForm").addContent(customFieldValue1);
            }
        },

        getCurrentDateInPlantTimeZone: function() {
            let dDate = new Date().toLocaleString("en-US", {
                timeZone: PlantSettings.getTimeZone()
            });
            let dStartToday = DateTimeUtils.dmcDateTimeStartOf(dDate, "day");
            return moment(dStartToday).format("YYYY-MM-DD");
        },

        /***
         * Fetch Material Uoms
         */
        fetchMaterialUoms: function(sMaterial, sVersion) {
            let sUrl = this.oController.getProductRestDataSourceUri() + "materials/uoms";
            let oParameters = {};
            oParameters.material = sMaterial;
            oParameters.version = sVersion;

            let that = this.oController;
            $.ajaxSettings.async = false;
            AjaxUtil.get(sUrl, oParameters, function(oResponseData) {
                let unitList = oResponseData.map(function(unit) {
                    return {
                        value: unit.uom,
                        text: unit.shortText
                    };
                });
                that.getView().setModel(new JSONModel(unitList), "unitModel");
            }, function(oError, oHttpErrorMessage) {
                let err = oError || oHttpErrorMessage;
                that.showErrorMessage(err, true, true);
                that.getView().setModel(new JSONModel({}), "unitModel");
            });
            $.ajaxSettings.async = true;
        },

        /***
         * GET call to fetch ShopOrder data
         * @param sOrderRef
         */
        getShopOrderData: function(sOrderRef) {
            let sUrl = this.oController.getDemandODataDataSourceUri() + "ShopOrders('" + sOrderRef + "')";
            let that = this.oController;
            AjaxUtil.get(sUrl, null, function(oResponseData) {
                that.getView().setModel(new JSONModel(oResponseData), "orderModel");
                this._enableDisableCalculation();
            }.bind(this), function(oError, oHttpErrorMessage) {
                let err = oError || oHttpErrorMessage;
                that.showErrorMessage(err, true, true);
                that.getView().setModel(new JSONModel({}), "orderModel");
            });
        },

        /***
         * Confirm Button on Post Pop-up pressed
         */
        onConfirmPostDialog: function() {
            let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
            let mainController = grController.oController; //
            grController._updateSettingModel(false);
            mainController.getView().getModel("settingsModel").refresh(true);
            let oPostModel = mainController.getView().getModel("postModel");
            let inventoryUrl = mainController.getInventoryDataSourceUri();
            let sUrl = inventoryUrl + "order/goodsReceipt";
            let targetQuantity = oPostModel.getProperty("/targetQuantity");
            if (targetQuantity.value == null) {
                MessageBox.error(Bundles.getGoodreceiptText("QUANTITY_VALUE_REQUIRED"));
                return;
            }
            grController.postData.customFieldData = grController._buildCustomFieldData();

            let oPayload = {
                triggerPoint: "ORD_POD_GR",
                orderNumber: grController.postData.shopOrder,
                lineItems: [{
                    sfc: grController.postData.batchId,
                    workCenter: grController.postData.workCenter,
                    material: grController.postData.material,
                    materialVersion: grController.postData.materialVersion,
                    quantity: {
                        value: grController.postData.quantity.value,
                        unitOfMeasure: {
                            commercialUnitOfMeasure: mainController.byId("uom").getSelectedKey()
                        }
                    },
                    quantityToleranceCheck: oPostModel.getProperty(sQuantityToleranceCheckProperty),
                    postedBy: grController.postData.userId,
                    postingDate: DateTimeUtils.dmcDateToUTCFormat(grController.postData.dateTime),
                    handlingUnitNumber: oPostModel.getProperty(sIsEwmManagedStorageLocationProperty) ? oPostModel.getProperty(sHandlingUnitNumberProperty) : null,
                    storageLocation: grController.postData.storageLocation,
                    batchNumber: grController.postData.batchNumber,
                    customFieldData: grController.postData.customFieldData,
                    comments: grController.postData.comments
                }]
            };
            grController.postGrData(sUrl, oPayload);
        },

        _buildCustomFieldData: function() {
            let aFiledData = [];
            if (this.oController.oPluginConfiguration && this.oController.oPluginConfiguration.customField1) {
                if (sap.ui.getCore().byId(POST_CUSTOM_FIELD_ID).getValue()) {
                    aFiledData.push({
                        "id": POST_CUSTOM_FIELD_ID,
                        "value": sap.ui.getCore().byId(POST_CUSTOM_FIELD_ID).getValue()
                    });
                }
            }
            return aFiledData.length > 0 ? JSON.stringify(aFiledData) : null;
        },

        /***
         * Reset the input fields
         */
        _resetFields: function() {
            let mainController = this.oController;
            mainController.byId("quantity").setValue("");
            mainController.byId("uom").setValue("");
            mainController.byId("batchNumberFilter").setValue("");
            mainController.byId("storageLocationFilter").setValue("");
            mainController.byId("handlingUnitNumber").setValue("");
            mainController.byId("postedBy").setValue("");
            mainController.byId("postingDate").setValue("");
            mainController.byId("inputCommentsForGR").setValue("");
            mainController.getView().getModel("postModel").setProperty(sQuantityToleranceCheckProperty, true);
            mainController.getView().getModel("postModel").setProperty("/quantity/value", 0);
            this.postData.batchRef = "";
            mainController.getView().byId("grConfirmBtn").setEnabled(false);
            mainController.byId("postDialog").setBusy(false);
            this.isBatchNumberValid = false;
            this.isHandlingUnitNumberValid = false;

            if (mainController.oPluginConfiguration && mainController.oPluginConfiguration.customField1) {
                sap.ui.getCore().byId(POST_CUSTOM_FIELD_ID).setValue("");
            }

            this._clearFiledsErrorState();
        },

        _clearFiledsErrorState: function(params) {
            let mainController = this.oController;
            ErrorHandler.clearErrorState(mainController.byId("quantity"));
            ErrorHandler.clearErrorState(mainController.byId("batchNumberFilter"));
            ErrorHandler.clearErrorState(mainController.byId("handlingUnitNumber"));
            ErrorHandler.clearErrorState(mainController.byId("postedBy"));
            ErrorHandler.clearErrorState(mainController.byId("postingDate"));
            ErrorHandler.clearErrorState(mainController.byId("inputCommentsForGR"));
        },

        /***
         * Validation for Quantity on change
         */
        onQuantityChange: function(oEvent) {
            let that = this.GRPostController || this;

            let oSetTimeOut = setTimeout(function() {
                that.handleValideQuantity();
                clearTimeout(oSetTimeOut);
            }, 500);
        },

        handleValideQuantity: function() {
            let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
            let oPostModel = grController.oController.getView().getModel("postModel");
            let oQuantityInpuCtrl = grController.oController.byId("quantity");
            let bValidate = oQuantityInpuCtrl.getValueState() !== "Error";
            let sValue = oQuantityInpuCtrl.getValue();
            if (!bValidate) {
                grController.isQuantityValid = false;
                grController.oController.byId("grConfirmBtn").setEnabled(false);
                if (typeof(NumberFormatter.dmcLocaleNumberParser(sValue)) === 'string') {
                    ErrorHandler.setErrorState(oQuantityInpuCtrl, `${sValue} - ${Bundles.getStatusText("enum.status.PARSEMSG")}`);
                }
            } else if (NumberFormatter.dmcLocaleNumberParser(sValue) === 0) {
                grController.isQuantityValid = false;
                grController.oController.byId("grConfirmBtn").setEnabled(false);
                ErrorHandler.setErrorState(oQuantityInpuCtrl, Bundles.getGoodreceiptText("POSITIVE_INPUT"));
            } else {
                grController.isQuantityValid = true;
                if (oPostModel.getProperty(sBatchNumberProperty)) {
                    grController.isBatchNumberValid = true;
                }
                grController._validatePostingdate(oPostModel.getProperty("/dateTime"));
                grController._enableConfirmButton();
            }

        },

        onPostingDateChange: function(oEvent) {
            let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
            let postingDate = oEvent.getSource().getValue();
            grController._validatePostingdate(postingDate);
            if (grController.isPostingDateValid === true) {
                grController._enableConfirmButton();
            }
        },

        _validatePostingdate(postingDate) {
            let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
            let mainController = grController.oController;
            let oView = mainController.getView();
            let dDate = new Date().toLocaleString("en-US", {
                timeZone: PlantSettings.getTimeZone()
            });
            let dStartToday = DateTimeUtils.dmcDateTimeStartOf(dDate, "day");

            grController.isPostingDateValid = false;
            ErrorHandler.clearErrorState(oView.byId("postingDate"));
            oView.byId("grConfirmBtn").setEnabled(false);

            if (!postingDate) {
                ErrorHandler.setErrorState(oView.byId("postingDate"), Bundles.getGoodreceiptText("REQUIRED_POSTING_DATE"));
            } else if (DateTimeUtils.dmcParseDate(postingDate) === null) {
                ErrorHandler.setErrorState(oView.byId("postingDate"), Bundles.getGoodreceiptText("INVALID_POSTING_DATE"));
            } else if (postingDate && Date.parse(postingDate) > (dStartToday.getTime() + 24 * 3599 * 1000)) {
                ErrorHandler.setErrorState(oView.byId("postingDate"), Bundles.getGoodreceiptText("FUTURE_DATE_NOT_ALLOWED"));
            } else {
                grController.isPostingDateValid = true;
            }
        },

        /***
         * Validation for Batch Number on live change
         */
        onBatchNumberLiveChange: function() {
            let oView = this.oController.getView();
            this.isBatchNumberValid = false;

            ErrorHandler.clearErrorState(oView.byId("batchNumberFilter"));
            oView.byId("grConfirmBtn").setEnabled(false);
            let batchNumber = oView.getModel("postModel").getProperty(sBatchNumberProperty);

            if (!batchNumber) {
                ErrorHandler.setErrorState(oView.byId("batchNumberFilter"), Bundles.getGoodreceiptText("REQUIRED_BATCH_INPUT"));
            } else if (this._validateBatchNumber(batchNumber, "batchNumberFilter")) {
                this.isBatchNumberValid = true;
                this._enableConfirmButton();
            }
        },

        /***
         * Validation for Handling Unit Number on live change
         */
        onHandlinhUnitNumberLiveChange: function() {
            let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
            let mainController = grController.oController;
            let oView = mainController.getView();

            grController.isHandlingUnitNumberValid = false;
            ErrorHandler.clearErrorState(oView.byId("handlingUnitNumber"));
            oView.byId("grConfirmBtn").setEnabled(false);
            let sHandlingUnitNumber = oView.getModel("postModel").getProperty(sHandlingUnitNumberProperty);

            // HU number is required when storageLocation is ewm managed
            if (sHandlingUnitNumber && grController._validateHandlingUnitNumber(sHandlingUnitNumber, "handlingUnitNumber")) {
                grController.isHandlingUnitNumberValid = true;
                grController._enableConfirmButton();
            }
            oView.getModel("postModel").setProperty(sHandlingUnitNumberProperty, sHandlingUnitNumber.toUpperCase());
        },

        /***
         * Validation for custom field on live change
         */
        onCustomFieldLiveChange: function(oEvent) {
            let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
            let mainController = grController.oController;
            let oView = mainController.getView();
            let customFieldId = oEvent.getSource().getId();
            let customFieldData = oEvent.getSource().getValue();

            grController.isCustomFieldValid = false;

            ErrorHandler.clearErrorState(oEvent.getSource());
            oView.byId("grConfirmBtn").setEnabled(false);

            if (this._validateCustomField(customFieldData, customFieldId)) {
                grController.isCustomFieldValid = true;
                this._enableConfirmButton();
            }
        },

        /***
         * BatchNumber Validation to NOT allow '/', '*', '&', space
         */
        _validateBatchNumber: function(sInputValue, sElementName) {
            return this._validateInputValue(sInputValue, sElementName, /^[^/&* ]+$/);
        },

        /***
         * handlingUnitNumber Validation to NOT allow space and max length 20
         */
        _validateHandlingUnitNumber: function(sInputValue, sElementName) {
            return this._validateInputValue(sInputValue, sElementName, /^[^ ]+$/) &&
                this._validateInputValue(sInputValue, sElementName, /^.{0,20}$/, Bundles.getGoodreceiptText("INVALID_HU_INPUT"));
        },

        /***
         * CustomField Validation to allow alpha numeric, '@', '.' characteion to allow alpha numeric, '@', '.' characters
         */
        _validateCustomField: function(sInputValue, sElementName) {
            return this._validateInputValue(sInputValue, sElementName, /^[A-Za-z0-9@. ]+$/);
        },

        _validateInputValue: function(sInputValue, sElementName, sRegex, sMsg) {
            // Regex for Valid Characters
            let isValidInput = true;

            if (sInputValue) {
                if (!sInputValue.match(sRegex)) {
                    ErrorHandler.setErrorState(this.oController.getView().byId(sElementName) || sap.ui.getCore().byId(sElementName), sMsg || Bundles.getGoodreceiptText("INVALID_INPUT"));
                    isValidInput = false;
                }
            }

            return isValidInput;
        },

        /***
         * Validation to enable Confirm Button on Post Pop-up
         */
        _enableConfirmButton: function() {
            let bIsBachManaged = this.oController.getView().getModel("postModel").getProperty("/batchManaged");
            // if is batchManaged, then required isBatchNumberValid is true
            // if is not batchManaged, then not required batchNumberValid
            let bIsEwmManaged = this.oController.getView().getModel("postModel").getProperty("/isEwmManagedStorageLocation");
            // if storageLocation is EWM managed, then HU is required
            // if storageLocation is not EWM managed, then HU will not show , and is not required
            if (((bIsBachManaged && this.isBatchNumberValid) || (!bIsBachManaged)) && this.isQuantityValid &&
                ((bIsEwmManaged && this.isHandlingUnitNumberValid) || !bIsEwmManaged) && this.isCustomFieldValid && this.isPostingDateValid) {
                this.oController.getView().byId("grConfirmBtn").setEnabled(true);
            }
        },

        /***
         * Post GR data
         */
        postGrData: function(sUrl, oRequestData) {
            this.sLatestPostedBatchNumber = oRequestData.batchNumber;
            AjaxUtil.post(sUrl, oRequestData, this._postGrDataSucessCallback.bind(this), this._postGrDataErrorCallback.bind(this));
        },

        _postGrDataSucessCallback: function(oResponseData) {
            let grController = this.GRPostController || this;
            grController._updateSettingModel(true);
            this.oController.getView().getModel("settingsModel").refresh();

            let oReponseItemData = null;
            if (oResponseData && oResponseData.lineItems.length > 0) {
                oReponseItemData = oResponseData.lineItems[0];
            } else {
                return;
            }
            if (oReponseItemData.batchCharacteristicWarningMessage) {
                MessageToast.show(Bundles.getGoodreceiptText("GR_POST_SUCCESS_WITH_WARNING_MESSAGE", oReponseItemData.batchCharacteristicWarningMessage));
            } else if (oReponseItemData.error) {
                this.oController.showErrorMessage(oReponseItemData.errorMessage);
                return;
            } else {
                MessageToast.show(Bundles.getGoodreceiptText("GR_POST_SUCCESS", oReponseItemData.inventoryId));
            }
            if (this._fnPostSuccesscallback) {
                this._fnPostSuccesscallback(oResponseData);
            }
            grController.onClosePostDialog();
        },

        _postGrDataErrorCallback: function(oError, oHttpErrorMessage) {
            let grController = this.GRPostController || this;

            let mainController = this.oController;
            grController._updateSettingModel(true);
            this.oController.getView().getModel("settingsModel").refresh();
            let err = (oError.lineItems && oError.lineItems[0]) || oHttpErrorMessage;
            if (err.error && err.errorCode === "gr.warning.quantity.overtolerance") {
                // confirm dialog
                MessageBox.confirm(err.errorMessage, {
                    icon: MessageBox.Icon.WARNING,
                    title: Bundles.getGlobalText("warning"),
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    onClose: function(oAction) {
                        if (oAction === "YES") {
                            mainController.byId("postDialog").setBusy(true);
                            mainController.getView().getModel("postModel").setProperty(sQuantityToleranceCheckProperty, false);
                            grController.onConfirmPostDialog();
                        }
                    }
                });
            } else if (err.error && err.errorCode === "batchNumber.value.invalid") {
                mainController.showErrorMessage(Bundles.getGoodreceiptText(err.errorCode, this.sLatestPostedBatchNumber), true, true);
                mainController.byId("postDialog").setBusy(false);
            } else if (err.error && err.errorCode === "quantity.value.exceed.max") {
                mainController.showErrorMessage(Bundles.getGoodreceiptText("INVALID_QUANTITY_DECIMAL_INPUT", [nDecimalPlaces, (nIntLength + nDecimalPlaces)]), true, true);
                mainController.byId("postDialog").setBusy(false);
            } else {
                mainController.showErrorMessage(err.errorMessage || err, true, true);
                mainController.byId("postDialog").setBusy(false);
            }
        },

        /***
         * Close Button on Post Pop-up pressed
         */
        onClosePostDialog: function() {
            // Reset the fields
            let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
            let mainController = grController.oController; //
            mainController.getView().byId("postDialog").close();

            grController._resetFields();
        },

        handleValueHelp: function(oEvent) {
            let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
            let mainController = grController.oController; //
            grController.oBatchControl.setController(mainController);
            grController.oBatchControl.setParentController(grController);
            let name = oEvent.oSource.sId;
            let material = grController.postData.material;
            let orderRef = grController.selectedOrderData.orderRef;
            let plant = orderRef.split(":")[1].split(",")[0];
            let oPostingsModel = mainController.getView().getModel("postModel");

            if (name.indexOf("batchNumberFilter") >= 0) {
                grController.handleBatchValueHelp(material, plant);
            } else if (name.indexOf("storageLocationFilter") >= 0) {
                let storageLocationFilter = mainController.byId("storageLocationFilter");
                let sl = "";
                if (storageLocationFilter) {
                    sl = storageLocationFilter.getValue();
                }
                storageLocationFilter.getValue();
                StorageLocationBrowse.open(mainController.getView(), sl, function(oSelectedObject) {
                    if (oSelectedObject) {
                        storageLocationFilter.setValue(oSelectedObject.name);
                        oPostingsModel.setProperty(sIsEwmManagedStorageLocationProperty, oSelectedObject.isEwmManagedStorageLocation);
                        if (oSelectedObject.isEwmManagedStorageLocation === false) {
                            oPostingsModel.setProperty(sHandlingUnitNumberProperty, null);
                        }
                        mainController.getView().byId("grConfirmBtn").setEnabled(false);
                        grController._enableConfirmButton();
                    }
                }, mainController.getView().getModel("inventory"));
            }
        },

        handleBatchValueHelp: function(sMaterial, sPlant) {
            let grController = this.GRPostController || this;
            let mainController = grController.oController;
            let sBatchNumber = "";
            let oBatchNumberFilter = mainController.getView().byId("batchNumberFilter");
            if (oBatchNumberFilter) {
                sBatchNumber = oBatchNumberFilter.getValue();
            }
            grController.oBatchControl._batchBrowseOpen(sMaterial, sPlant, sBatchNumber, function() {
                this.onBatchNumberLiveChange();
            }.bind(grController))
        },

        /***
         * Prepare the data to make GET call to fetch GR Details
         */
        fetchGrPostDetails: function(oData) {
            let that = this.oController;
            let inventoryUrl = that.getInventoryDataSourceUri();
            let oParameters = {};
            let order = oData.shopOrder;
            let batchId = oData.sfc;
            oParameters.shopOrder = order;
            oParameters.batchId = batchId;
            oParameters.material = oData.material;
            oParameters.dontShowPrint = oData.dontShowPrint || false;
            let sUrl = inventoryUrl + "order/goodsReceipt/details";
            this.getGrPostings(sUrl, oParameters);
        },

        /***
         * Fetch GR Details data
         */
        getGrPostings: function(sUrl, oParameters) {
            let mainController = this.oController;
            let that = this;

            AjaxUtil.get(sUrl, oParameters, function(oResponseData) {
                that._buidPostingCustomFieldColumns(oResponseData.details);
                that.postingsList = oResponseData;
                that.postingsList.dontShowPrint = oParameters.dontShowPrint;
                that.oPostingsModel = new JSONModel();
                that.oPostingsModel.setSizeLimit(that.postingsList.details.length);
                that.oPostingsModel.setData(that.postingsList);
                mainController.byId("postingsTable").setModel(that.oPostingsModel, "postingsModel");
                mainController.byId("postingsTable").setBusy(false);
            }, function(oError, sHttpErrorMessage) {
                let err = oError ? oError.error.message : sHttpErrorMessage;
                mainController.showErrorMessage(err, true, true);
                that.postingsList = {};
            });
        },

        _buidPostingCustomFieldColumns: function(aPostingsListData) {
            let mainController = this.oController;
            let oTable = mainController.byId("postingsTable");
            let oListItem = mainController.byId("postingsTableListItem");
            let oHeaderColumnData = {};
            let that = this;

            aPostingsListData.forEach(function(oRowdata) {
                if (that.oController.oPluginConfiguration && that.oController.oPluginConfiguration.customField1 && oRowdata.customFieldData) {
                    let aCustomeDataFields = JSON.parse(oRowdata.customFieldData);
                    aCustomeDataFields.forEach(function(oDataField) {
                        if (!oHeaderColumnData[oDataField.id]) {
                            oHeaderColumnData[oDataField.id] = that._getPluginConfigurationText(oDataField.id);
                        }
                        oRowdata[oDataField.id] = oDataField.value;
                    });
                }
            });

            let aHeaderKeys = Object.keys(oHeaderColumnData).sort();
            aHeaderKeys.forEach(function(sHeaderKey, index) {
                let oColumn = new sap.m.Column({
                    styleClass: POSTING_CUMSTOM_FIELD,
                    header: new sap.m.Text({
                        text: oHeaderColumnData[sHeaderKey]
                    })
                });
                oTable.insertColumn(oColumn, 9 + index); // insert customField column

                let oText = new sap.m.Text({
                    text: {
                        path: "postingsModel>" + sHeaderKey
                    }
                });
                oListItem.insertCell(oText, 9 + index); //insert customField Cell
            });
            oTable.bindItems({
                path: "postingsModel>/details",
                sorter: {
                    path: 'createdDateTime',
                    descending: true
                },
                template: oListItem
            });
        },

        _getPluginConfigurationText: function(sCustomFieldKey) {
            return this.oController.oPluginConfiguration && this.oController.oPluginConfiguration[sCustomFieldKey];
        },

        /**
         * Enable/Disable Calculate button
         * @private
         */
        _enableDisableCalculation: function() {
            if (this.oController.getView().getModel("postModel")) {
                let sBomRef = this.oController.getView().getModel("orderModel").getProperty("/actualBom").ref;
                let sUrl = this.oController.getProductDataSourceUri() + "Boms('" + sBomRef + "')?$select=*&$expand=dataType($expand=dataFieldList($expand=dataField($expand=formula($expand=variables))))";
                AjaxUtil.get(sUrl, {}, this._enableCalculation.bind(this), this._disableCalculation.bind(this));
            }
        },

        _enableCalculation: function(oResponseData) {
            let oModel = this.oController.getView().getModel("postModel");
            if (oResponseData && oResponseData.dataType && oResponseData.dataType.dataFieldList) {
                let oFormula = this._getFormulaForCalculation(oResponseData);
                oModel.setProperty(sFormulaProperty, oFormula.formula);
                oModel.setProperty("/bomRef", oResponseData.ref);
                oModel.setProperty(sRecalculationEnabledProperty, oFormula.enableFormula);
            } else {
                oModel.setProperty(sFormulaProperty, null);
                oModel.setProperty("/bomRef", null);
                oModel.setProperty(sRecalculationEnabledProperty, false);
            }
        },

        _disableCalculation: function(oError, oHttpErrorMessage) {
            let oModel = this.oController.getView().getModel("postModel");
            oModel.setProperty(sFormulaProperty, null);
            oModel.setProperty(sRecalculationEnabledProperty, false);
            this.oController.showErrorMessage(oError || oHttpErrorMessage, true, true);
        },

        onFormulaCalculate: function(oEvent) {
            let oGrpController = this.GRPostController || this;
            let oView = this.getView();
            let oData = oView.getModel("postModel").getData();
            let oFormula = oData.formula;
            oFormula.resultContextRef = oData.bomRef;
            FormulaCalculateDialog.open(oView, oFormula, oGrpController._calculateFormulaCallBack.bind(oGrpController));
        },

        _calculateFormulaCallBack: function(oResult) {
            let oModel = this.oController.getView().getModel("postModel");
            oModel.setProperty("/quantity/value", oResult.result.toString());
            oModel.setProperty("/calculatedData", oResult);
            this.onQuantityChange();
        },

        /**
         * Determine assigned formula to FORMULA data field
         * @param {oResponseData} Response of Bom Component ODATA request
         * @private
         */
        _getFormulaForCalculation: function(oResponseData) {
            let oFormula = {
                formula: null,
                enableFormula: false
            };

            let aDataFieldList = oResponseData.dataType.dataFieldList;
            let aFormulaDataFields = aDataFieldList.filter(function(oItem) {
                if (oItem.dataField.type === "FORMULA") {
                    return oItem.dataField;
                }
            });

            if (aFormulaDataFields.length > 0) {
                oFormula = this._getFromFormulaDataFieldsArray(aFormulaDataFields);
            }

            return oFormula;
        },

        _getFromFormulaDataFieldsArray: function(aFormulaDataFields) {
            let aFormulas = [];
            let oFormula = {
                formula: null,
                enableFormula: false
            };

            aFormulaDataFields.forEach(function(oItem) {
                if (oItem.dataField.formula) {
                    aFormulas.push(oItem.dataField.formula);
                }
            });

            if (aFormulas && aFormulas.length > 0) {
                aFormulas.sort(function(x, y) {
                    let a = x.formulaName.toUpperCase();
                    let b = y.formulaName.toUpperCase();
                    return a === b ? 0 : a > b ? 1 : -1;
                });
                // On today there is no Use case for multiple assigned formula to Data Field
                // Return first Formula object
                oFormula.formula = aFormulas[0];
                if (oFormula.formula) {
                    oFormula.enableFormula = true;
                }
            }

            return oFormula;
        },

        /***
         * Close Button on Postings Pop-up pressed
         * this here is the app controller
         */
        onClosePostingsDialog: function() {
            let oTable = this.getView().byId("postingsTable");
            let oColumnListItem = this.getView().byId("postingsTableListItem");

            oTable.getColumns().forEach(function(oColumn, nIndex) {
                if (oColumn.getStyleClass().indexOf(POSTING_CUMSTOM_FIELD) > -1) {
                    oColumnListItem.removeCell(nIndex);
                    oTable.removeColumn(oColumn);
                }
            });
            oTable.bindItems({
                path: "postingsModel>/details",
                sorter: {
                    path: 'createdDateTime',
                    descending: true
                },
                template: oColumnListItem
            });

            this.getView().byId("postingsDialog").close();
        },

        /**
         * handler for press event of Print button in view postings dialog
         * opens the print label dialog
         * @param {object} oEvent
         */
        onPrintBtnPressed: function(oEvent) {
            let oGrController = this.GRPostController || this;
            let oMainController = oGrController.oController;
            let oView = oMainController.getView();
            let iIndex = +oEvent.getSource().getParent().getBindingContextPath().split("/details/")[1];

            oGrController.oPrintingLabelDialog.open(oGrController.oPostingsModel.getProperty("/shopOrder"), oView, oMainController, oMainController.getConfiguration() && oMainController.getConfiguration().printLabelConfiguration, iIndex);
        },

        onExit: function() {
            let grController = this.GRPostController || this; // if this is controller.js, get GRPostController, else . return this;
            let mainController = grController.oController; //

            if (mainController.byId("postingsDialog")) {
                mainController.byId("postingsDialog").destroy();
            }
        }
    };
});