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
    "dojo/query",
    "dojo/_base/lang",
], function (declare, _WidgetBase, dojoQuery, dojoLang) {
    "use strict";

    // Declare widget's prototype.
    return declare("FocusHelper.widget.FocusHelper", [_WidgetBase], {
        // _TemplatedMixin will create our dom node using this HTML template.
        // templateString: widgetTemplate,

        // DOM elements

        // Parameters configured in the Modeler.
        targetName: "",
        formContext: "",
        initializeFocusAttr: "",
        mfAfterFocus: "",
        executeImmediately: null,

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
            this._widgetReadOnly = false;
        },

        // dijit._WidgetBase.postCreate is called after constructing the widget. Implement to do extra setup work.
        postCreate: function () {
            logger.debug(this.id + ".postCreate");

            // if the entire dataview is readonly, this widget should not trigger
            if (this.readOnly || this.get("disabled") || this.readonly) {
                this._globalReadOnly = true;
                this._readOnly = true;
                // the dataview is readonly so delete everything in advance
            }
        },

        // mxui.widget._WidgetBase.update is called when context is changed or initialized. Implement to re-render and / or fetch data.
        update: function (obj, callback) {
            logger.debug(this.id + ".update");

            this._contextObj = obj;

            if (this.executeImmediately) {
                this._waitForDomNode(this.targetName + " input", this.domNode.parentElement, 10, this._setFocusOnInput.bind(this));
            }

            // if global dataview is readonly then do nothing
            if (this._globalReadOnly) {
                this._executeCallback(callback, "postCreate");
            } else {
                this._resetSubscriptions();
                this._updateRendering(callback); // We're passing the callback to updateRendering to be called after DOM-manipulation
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
            // return this._waitForDomNode('input', parentNode, 10, function(r){ return r} );
            return dojoQuery('input', parentNode)[0];
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

        // Reset subscriptions.
        _resetSubscriptions: function () {
            logger.debug(this.id + "._resetSubscriptions");
            // Release handles on previous object, if any and reset events
            this.unsubscribeAll();

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
        },

        _waitForDomNode: function (query, start, attempts, callback) {
            var countdown = attempts;
            var wait = setInterval(function () {
                var q = start.querySelector(query);
                if (q || countdown <= 0) {
                    clearInterval(wait);
                    console.log('clearing interval');
                    callback(q);
                } else {
                    countdown--;
                }
            }.bind(this), 100)
        }
    });
});

require(["FocusHelper/widget/FocusHelper"]);
