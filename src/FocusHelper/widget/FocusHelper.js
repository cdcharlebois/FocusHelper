/*global logger*/
/*
    FocusHelper
    ========================

    @file      : FocusHelper.js
    @version   : 1.0.0
    @author    : Willem Gorisse
    @date      : 2018-7-30
    @copyright : Mendix 2018
    @license   : Apache 2

    Documentation
    ========================
    A helper tool that can set the focus on a form-control triggered by logic such as a microflows, nanoflows and pageloads.
*/

// Required module list. Remove unnecessary modules, you can always get them back from the boilerplate.
define([
    "dojo/_base/declare",
    "mxui/widget/_WidgetBase",
    "dijit/_TemplatedMixin",

    "mxui/dom",
    "dojo/dom",
    "dojo/dom-prop",
    "dojo/dom-geometry",
    "dojo/dom-class",
    "dojo/dom-attr",
    "dojo/query",
    "dojo/NodeList-traverse",
    "dojo/dom-style",
    "dojo/dom-construct",
    "dojo/_base/array",
    "dojo/_base/lang",
    "dojo/text",
    "dojo/html",
    "dojo/_base/event",

    "dojo/text!FocusHelper/widget/template/FocusHelper.html"
], function (declare, _WidgetBase, _TemplatedMixin, dom, dojoDom, dojoProp, dojoGeometry, dojoClass, dojoAttr, dojoQuery, dojoTraverse, dojoStyle, dojoConstruct, dojoArray, dojoLang, dojoText, dojoHtml, dojoEvent, widgetTemplate) {
    "use strict";

    // Declare widget's prototype.
    return declare("FocusHelper.widget.FocusHelper", [_WidgetBase, _TemplatedMixin], {
        // _TemplatedMixin will create our dom node using this HTML template.
        templateString: widgetTemplate,

        // DOM elements

        // Parameters configured in the Modeler.
        targetName: "",
        formContext: "",
        initializeFocusAttr: "",
        mfAfterFocus: "",

        // Internal variables. Non-primitives created in the prototype are shared between all widget instances.
        _handles: null,
        _contextObj: null,
        _setFocus: null,
        _globalReadOnly: null,
        _readOnly: null,
        _pageLoadListener: null,
        _targetNameNode: null,
        _targetDijitWidget: null,
        _targetFormField: null,

        // dojo.declare.constructor is called to construct the widget instance. Implement to initialize non-primitive properties.
        constructor: function () {
            logger.debug(this.id + ".constructor");
            this._handles = [];
            this._setFocus = false;
            this._readOnly = false;
        },

        // dijit._WidgetBase.postCreate is called after constructing the widget. Implement to do extra setup work.
        postCreate: function () {
            logger.debug(this.id + ".postCreate");
            this._setFocus = false;
            this._readOnly = false;
            this._widgetReadOnly = false;

            if (this.targetName && this.targetName !== "") {
                this.targetName = ".mx-name-" + this.targetName;
            }

            // if the entire dataview is readonly, this widget should not trigger
            if (this.readOnly || this.get("disabled") || this.readonly) {
                this._globalReadOnly = true;
                this._readOnly = true;
                // the dataview is readonly so delete everything in advance
            } else {
                this._pageLoadListener = this.connect(this.mxform, "onNavigation", dojoLang.hitch(this, this._onPageLoad));

                this._updateRendering();
                this._setupEvents();
            }




        },

        // mxui.widget._WidgetBase.update is called when context is changed or initialized. Implement to re-render and / or fetch data.
        update: function (obj, callback) {
            logger.debug(this.id + ".update");

            this._contextObj = obj;

            // destroy the domnode as we don't need it.
            if (this.domNode) {
                dojoConstruct.destroy(this.domNode);
            }
            // if global dataview is readonly then do nothing
            if (this._globalReadOnly) {
                this._executeCallback(callback, "postCreate");
            } else {
                this._resetSubscriptions();
                this._updateRendering(callback); // We're passing the callback to updateRendering to be called after DOM-manipulation
            }


        },

        // mxui.widget._WidgetBase.enable is called when the widget should enable editing. Implement to enable editing if widget is input widget.
        enable: function () {
            //logger.debug(this.id + ".enable");
        },

        // mxui.widget._WidgetBase.enable is called when the widget should disable editing. Implement to disable editing if widget is input widget.
        disable: function () {
            //logger.debug(this.id + ".disable");
        },

        // mxui.widget._WidgetBase.resize is called when the page's layout is recalculated. Implement to do sizing calculations. Prefer using CSS instead.
        resize: function (box) {
            //logger.debug(this.id + ".resize");
        },

        // mxui.widget._WidgetBase.uninitialize is called when the widget is destroyed. Implement to do special tear-down work.
        uninitialize: function () {
            logger.debug(this.id + ".uninitialize");

            if (this._pageLoadListener) {
                this.disconnect(this._pageLoadListener);
                this._pageLoadListener = null;
            }
            // Clean up listeners, helper objects, etc. There is no need to remove listeners added with this.connect / this.subscribe / this.own.
        },

        // We want to stop events on a mobile device
        _stopBubblingEventOnMobile: function (e) {
            logger.debug(this.id + "._stopBubblingEventOnMobile");
            if (typeof document.ontouchstart !== "undefined") {
                dojoEvent.stop(e);
            }
        },

        // set the focus on the element
        _setFocusOnInput(inputNode) {
            inputNode.focus();
            this._setFocus = false;

            if (this.mfAfterFocus !== "") {
                this._execMf(this.mfAfterFocus, this._contextObj.getGuid());
            }
        },

        // Attach events to HTML dom elements
        _setupEvents: function () {
            //logger.debug(this.id + "._setupEvents");
        },

        // logic triggered page load event - note: not triggered if conditional visiblity is used
        _onPageLoad: function (event) {
            var formField;

            // get rid of the event on the pageload
            this.disconnect(this._pageLoadListener);
            this._pageLoadListener = null;

            // find the formfield domnode
            this._targetNameNode = this._findTargetField(this.targetName);
            if (this._targetNameNode !== null && this._targetNameNode !== undefined) {
                // check if element allready is the formcontrol
                formField = this._findInputField(this._targetNameNode);

                if (formField !== null && formField !== undefined) {
                    this._targetFormField = formField;
                    if (this._setFocus && !this._readOnly && !this._globalReadOnly) {
                        this._setFocusOnInput(this._targetFormField);
                    }
                }
            } else {
                // this scenario could happen if we have a static form control / text only: do nothing
                // this._globalReadOnly = true; 
                logger.debug(this.id + " could not find the target formfield");
            }
        },

        // method for finding the parent field, returns target object
        _findTargetField: function (searchName) {
            var result;

            // find the node
            result = dojoQuery(searchName);
            result = result[0];

            return result;

        },

        // method for finding the input fields node and already checking the dijitwidget
        _findInputField: function (parentNode) {
            var result;
            // first check the parentNode itself
            if (dojoClass.contains(parentNode, "form-control")) {
                result = parentNode;
            } else {
                result = dojoQuery(".form-control", parentNode)[0];
            }
            if (result !== null && result !== undefined) {
                this._targetDijitWidget = dijit.byNode(result);
                // if the targetDijit is undefined it could also mean we need its parent
                if (this._targetDijitWidget === null || this._targetDijitWidget === undefined) {
                    this._targetDijitWidget = dijit.byNode(dojoQuery(result).parent()[0]);
                }
                if (this._targetDijitWidget && this._targetDijitWidget.hasOwnProperty('readOnly')) {
                    this._readOnly = true;
                }
            } else {
                // return a null
                logger.debug(this.id + "could not find an editable formfield to focus on");
                result = null;
            }
            return result;
        },

        _execMf: function (mf, guid, cb) {
            logger.debug(this.id + "._execMf");
            if (mf && guid) {
                mx.ui.action(mf, {
                    params: {
                        applyto: "selection",
                        guids: [guid]
                    },
                    callback: dojoLang.hitch(this, function (objs) {
                        if (cb && typeof cb === "function") {
                            cb(objs);
                        }
                    }),
                    error: function (error) {
                        console.debug(error.description);
                    }
                }, this);
            }
        },

        // Rerender the interface.
        _updateRendering: function (callback) {
            var formField;
            logger.debug(this.id + "._updateRendering");

            // 
            if (this._contextObj !== null) {
                // first get the setFocus value
                this._setFocus = this._contextObj.get(this.initializeFocusAttr);
                // first check if the targetformfield is set
                if (this._targetFormField !== null && this._targetFormField !== undefined) {
                    // check if readonly states are false and if there is a reason for focus
                    if (!this._globalReadOnly && !this._readOnly && this._setFocus) {
                        this._setFocusOnInput(this._targetFormField);
                    }
                } else {
                    // this could happen if the disabled state is readonly, if so we should try and find it again
                    // we do however need a targetNode, if that is not present we should do nothing
                    this._targetNameNode = this._findTargetField(this.targetName);

                    if (this._targetNameNode !== null && this._targetNameNode !== undefined) {
                        // check if element allready is the formcontrol
                        formField = this._findInputField(this._targetNameNode);

                        // does our formField already exist?
                        if (formField !== null) {
                            this._targetFormField = formField;
                            if (this._setFocus && !this._readOnly && !this._globalReadOnly) {
                                this._setFocusOnInput(this._targetFormField);
                            }
                        }
                    }
                }
            }


            // The callback, coming from update, needs to be executed, to let the page know it finished rendering
            this._executeCallback(callback, "_updateRendering");
        },

        // get rid of all events and handles
        _unsubscribeEvents: function () {
            this.unsubscribeAll();
        },

        // Reset subscriptions.
        _resetSubscriptions: function () {
            logger.debug(this.id + "._resetSubscriptions");
            // Release handles on previous object, if any and reset events
            this._unsubscribeEvents();

            // When a mendix object exists create subscribtions.
            if (this._contextObj) {
                this.subscribe({
                    guid: this._contextObj.getGuid(),
                    callback: dojoLang.hitch(this, function (guid) {
                        this._updateRendering(function () { });
                    })
                });

                this.subscribe({
                    guid: this._contextObj.getGuid(),
                    attr: this.initializeFocusAttr,
                    callback: dojoLang.hitch(this, function (guid, attr, attrValue) {
                        this._updateRendering(function () { });
                    })
                });
            }
        },

        _executeCallback: function (cb, from) {
            logger.debug(this.id + "._executeCallback" + (from ? " from " + from : ""));
            if (cb && typeof cb === "function") {
                cb();
            }
        }
    });
});

require(["FocusHelper/widget/FocusHelper"]);
