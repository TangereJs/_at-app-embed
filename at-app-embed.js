/*
 * based on: iframeReizer.js
 * Author: David J. Bradshaw - dave@bradshaw.net
 * Contributor: Jure Mav - jure.mav@gmail.com
 * License: MIT, https://github.com/davidjbradshaw/iframe-resizer
 */
;
(function () {
  'use strict';

  // initialize only once after async load
  if (!window.atAppEmbedLoaded) {
    window.atAppEmbedLoaded = true;
  } else {
    return;
  }

  var
    count = 0,
    firstRun = true,
    msgHeader = 'message',
    msgHeaderLen = msgHeader.length,
    msgId = '[iFrameSizer]', //Must match iframe msg ID
    msgIdLen = msgId.length,
    page = '', //:'+location.href, //Uncoment to debug nested iFrames
    pagePosition = null,
    requestAnimationFrame = window.requestAnimationFrame,
    resetRequiredMethods = {
      max: 1,
      scroll: 1,
      bodyScroll: 1,
      documentElementScroll: 1
    },

    settings = {},

    defaults = {
      autoResize: true,
      bodyBackground: null,
      bodyMargin: null,
      bodyMarginV1: 8,
      bodyPadding: null,
      checkOrigin: true,
      enablePublicMethods: true,
      heightCalculationMethod: 'bodyScroll', // 'offset',
      interval: 32,
      log: false,
      maxHeight: Infinity,
      maxWidth: Infinity,
      minHeight: 0,
      minWidth: 0,
      scrolling: false,
      sizeHeight: true,
      sizeWidth: false,
      tolerance: 0,
      closedCallback: function () { },
      initCallback: function () { },
      messageCallback: function () { },
      resizedCallback: function () { }
    };

  function addEventListener(obj, evt, func) {
    if ('addEventListener' in window) {
      obj.addEventListener(evt, func, false);
    } else if ('attachEvent' in window) { //IE
      obj.attachEvent('on' + evt, func);
    }
  }

  function setupRequestAnimationFrame() {
    var
      vendors = ['moz', 'webkit', 'o', 'ms'],
      x;

    // Remove vendor prefixing if prefixed and break early if not
    for (x = 0; x < vendors.length && !requestAnimationFrame; x += 1) {
      requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
    }

    if (!(requestAnimationFrame)) {
      log(' RequestAnimationFrame not supported');
    }
  }

  function log(msg) {
    if (settings.log && (typeof console === 'object')) {
      console.log(msgId + '[Host page' + page + ']' + msg);
    }
  }


  function iFrameListener(event) {
    function resizeIFrame() {
      function resize() {
        setSize(messageData);
        // *test* why is that needed? causes loss of page position -- setPagePosition();
        settings.resizedCallback(messageData);
      }

      ensureInRange('Height');
      ensureInRange('Width');

      syncResize(resize, messageData, 'resetPage');
    }

    function closeIFrame(iframe) {
      var iframeID = iframe.id;

      log(' Removing iFrame: ' + iframeID);
      iframe.parentNode.removeChild(iframe);
      settings.closedCallback(iframeID);
      log(' --');
    }

    function processMsg() {
      var data = msg.substr(msgIdLen).split(':');

      return {
        iframe: document.getElementById(data[0]),
        id: data[0],
        height: data[1],
        width: data[2],
        type: data[3]
      };
    }

    function ensureInRange(Dimension) {
      var
        max = Number(settings['max' + Dimension]),
        min = Number(settings['min' + Dimension]),
        dimension = Dimension.toLowerCase(),
        size = Number(messageData[dimension]);

      if (min > max) {
        throw new Error('Value for min' + Dimension + ' can not be greater than max' + Dimension);
      }

      log(' Checking ' + dimension + ' is in range ' + min + '-' + max);

      if (size < min) {
        size = min;
        log(' Set ' + dimension + ' to min value');
      }

      if (size > max) {
        size = max;
        log(' Set ' + dimension + ' to max value');
      }

      messageData[dimension] = '' + size;
    }

    function isMessageFromIFrame() {

      var
        origin = event.origin,
        remoteHost = messageData.iframe.src.split('/').slice(0, 3).join('/');

      if (settings.checkOrigin) {
        log(' Checking connection is from: ' + remoteHost);

        if (('' + origin !== 'null') && (origin !== remoteHost)) {
          throw new Error(
            'Unexpected message received from: ' + origin +
            ' for ' + messageData.iframe.id +
            '. Message was: ' + event.data +
            '. This error can be disabled by adding the checkOrigin: false option.'
          );
        }
      }

      return true;
    }

    function isMessageForUs() {
      return msgId === ('' + msg).substr(0, msgIdLen); //''+Protects against non-string msg
    }

    function isMessageFromMetaParent() {
      //test if this message is from a parent above us. This is an ugly test, however, updating
      //the message format would break backwards compatibity.
      var retCode = messageData.type in {
        'true': 1,
        'false': 1
      };

      if (retCode) {
        log(' Ignoring init message from meta parent page');
      }

      return retCode;
    }

    function forwardMsgFromIFrame() {
      var msgBody = msg.substr(msg.indexOf(':') + msgHeaderLen + 6); //6 === ':0:0:' + ':' (Ideas to name this magic number most welcome)

      log(' MessageCallback passed: {iframe: ' + messageData.iframe.id + ', message: ' + msgBody + '}');
      settings.messageCallback({
        iframe: messageData.iframe,
        message: JSON.parse(msgBody)
      });
      log(' --');
    }

    function checkIFrameExists() {
      if (null === messageData.iframe) {
        throw new Error('iFrame (' + messageData.id + ') does not exist on ' + page);
      }
      return true;
    }

    function getIFramePosition() {
      var iFramePosition = messageData.iframe.getBoundingClientRect();

      getPagePosition();

      return {
        x: Number(iFramePosition.left) + Number(pagePosition.x),
        y: Number(iFramePosition.top) + Number(pagePosition.y)
      };
    }

    function scrollRequestFromChild(addOffset) {
      var offset = addOffset ? getIFramePosition() : {
        x: 0,
        y: 0
      };

      log(' Reposition requested from iFrame (offset x:' + offset.x + ' y:' + offset.y + ')');
      pagePosition = {
        x: Number(messageData.width) + offset.x,
        y: Number(messageData.height) + offset.y
      };
      setPagePosition();
    }

    function actionMsg() {
      switch (messageData.type) {
        case 'close':
          closeIFrame(messageData.iframe);
          settings.resizedCallback(messageData); //To be removed.
          break;
        case 'message':
          forwardMsgFromIFrame();
          break;
        case 'scrollTo':
          scrollRequestFromChild(false);
          break;
        case 'scrollToOffset':
          scrollRequestFromChild(true);
          break;
        case 'reset':
          resetIFrame(messageData);
          break;
        case 'init':
          resizeIFrame();
          settings.initCallback(messageData.iframe);
          break;
        default:
          resizeIFrame();
      }
    }

    var
      msg = event.data,
      messageData = {};

    if (isMessageForUs()) {
      log(' Received: ' + msg);
      messageData = processMsg();

      if (!isMessageFromMetaParent() && checkIFrameExists() && isMessageFromIFrame()) {
        actionMsg();
        firstRun = false;
      }
    }
  }


  function getPagePosition() {
    if (null === pagePosition) {
      pagePosition = {
        x: (window.pageXOffset !== undefined) ? window.pageXOffset : document.documentElement.scrollLeft,
        y: (window.pageYOffset !== undefined) ? window.pageYOffset : document.documentElement.scrollTop
      };
      log(' Get position: ' + pagePosition.x + ',' + pagePosition.y);
    }
  }

  function setPagePosition() {
    if (null !== pagePosition) {
      window.scrollTo(pagePosition.x, pagePosition.y);
      log(' Set position: ' + pagePosition.x + ',' + pagePosition.y);     
      pagePosition = null;
    }    
  }

  function resetIFrame(messageData) {
    function reset() {
      setSize(messageData);
      trigger('reset', 'reset', messageData.iframe);
    }

    log(' Size reset requested by ' + ('init' === messageData.type ? 'host page' : 'iFrame'));
    getPagePosition();
    syncResize(reset, messageData, 'init');
  }

  function setSize(messageData) {
    function setDimension(dimension) {
      messageData.iframe.style[dimension] = messageData[dimension] + 'px';
      log(
        ' IFrame (' + messageData.iframe.id +
        ') ' + dimension +
        ' set to ' + messageData[dimension] + 'px'
      );
    }

    if (settings.sizeHeight) {
      setDimension('height');
    }
    if (settings.sizeWidth) {
      setDimension('width');
    }
  }

  function syncResize(func, messageData, doNotSync) {
    if (doNotSync !== messageData.type && requestAnimationFrame) {
      log(' Requesting animation frame');
      requestAnimationFrame(func);
    } else {
      func();
    }
  }

  function trigger(calleeMsg, msg, iframe) {
    log('[' + calleeMsg + '] Sending msg to iframe (' + msg + ')');
    iframe.contentWindow.postMessage(msgId + msg, '*');
  }


  function setupIFrame() {
    function setLimits() {
      function addStyle(style) {
        if ((Infinity !== settings[style]) && (0 !== settings[style])) {
          iframe.style[style] = settings[style] + 'px';
          log(' Set ' + style + ' = ' + settings[style] + 'px');
        }
      }

      addStyle('maxHeight');
      addStyle('minHeight');
      addStyle('maxWidth');
      addStyle('minWidth');
    }

    function ensureHasId(iframeID) {
      if ('' === iframeID) {
        iframe.id = iframeID = 'iFrameResizer' + count++;
        log(' Added missing iframe ID: ' + iframeID + ' (' + iframe.src + ')');
      }

      return iframeID;
    }

    function setScrolling() {
      log(' IFrame scrolling ' + (settings.scrolling ? 'enabled' : 'disabled') + ' for ' + iframeID);
      iframe.style.overflow = false === settings.scrolling ? 'hidden' : 'auto';
      iframe.scrolling = false === settings.scrolling ? 'no' : 'yes';
    }

    //The V1 iFrame script expects an int, where as in V2 expects a CSS
    //string value such as '1px 3em', so if we have an int for V2, set V1=V2
    //and then convert V2 to a string PX value.
    function setupBodyMarginValues() {
      if (('number' === typeof (settings.bodyMargin)) || ('0' === settings.bodyMargin)) {
        settings.bodyMarginV1 = settings.bodyMargin;
        settings.bodyMargin = '' + settings.bodyMargin + 'px';
      }
    }

    function createInitMsg() {

      var zone = "protected";
      var status = window.status;

      // try to detect IE Intranet zone, when IE IFrame is in different zone access to cookies is restricted
      window.status = "Intranet Zone";
      if (window.status == "Intranet Zone") zone = "internal";
      window.status = status;

      return iframeID +
        ':' + settings.bodyMarginV1 +
        ':' + settings.sizeWidth +
        ':' + settings.log +
        ':' + settings.interval +
        ':' + settings.enablePublicMethods +
        ':' + settings.autoResize +
        ':' + settings.bodyMargin +
        ':' + settings.heightCalculationMethod +
        ':' + settings.bodyBackground +
        ':' + settings.bodyPadding +
        ':' + settings.tolerance +
        ':' + zone;
    }

    function init(msg) {
      //We have to call trigger twice, as we can not be sure if all
      //iframes have completed loading when this code runs. The
      //event listener also catches the page changing in the iFrame.
      addEventListener(iframe, 'load', function () {
        var fr = firstRun; // Reduce scope of var to function, because IE8's JS execution
        // context stack is borked and this value gets externally
        // changed midway through running this function.
        trigger('iFrame.onload', msg, iframe);
        if (!fr && settings.heightCalculationMethod in resetRequiredMethods) {
          resetIFrame({
            iframe: iframe,
            height: 0,
            width: 0,
            type: 'init'
          });
        }
      });
      trigger('init', msg, iframe);
    }

    var
    /*jshint validthis:true */
      iframe = this,
      iframeID = ensureHasId(iframe.id);

    setScrolling();
    setLimits();
    setupBodyMarginValues();
    init(createInitMsg());
  }

  function checkOptions(options) {
    if ('object' !== typeof options) {
      throw new TypeError('Options is not an object.');
    }
  }

  function createNativePublicFunction() {
    function init(element) {
      if ('IFRAME' !== element.tagName.toUpperCase()) {
        throw new TypeError('Expected <IFRAME> tag, found <' + element.tagName + '>.');
      } else {
        setupIFrame.call(element);
      }
    }

    function processOptions(options) {
      options = options || {};
      checkOptions(options);

      for (var option in defaults) {
        if (defaults.hasOwnProperty(option)) {
          settings[option] = options.hasOwnProperty(option) ? options[option] : defaults[option];
        }
      }
    }

    return function iFrameResizeF(options, selecter) {
      processOptions(options);
      Array.prototype.forEach.call(document.querySelectorAll(selecter || 'iframe'), init);
      window.iFrameResize.settings = settings;
    };
  }

  function createJQueryPublicMethod($) {
    $.fn.iFrameResize = function $iFrameResizeF(options) {
      options = options || {};
      checkOptions(options);
      settings = $.extend({}, defaults, options);
      return this.filter('iframe').each(setupIFrame).end();
    };
  }


  setupRequestAnimationFrame();
  addEventListener(window, 'message', iFrameListener);
  //window.addEventListener('message', iFrameListener.bind(this));

  /* don't use accidentially existing jquery from parent
  if (window.jQuery) {
    createJQueryPublicMethod(jQuery);
  }

  if (typeof define === 'function' && define.amd) {
    define([], createNativePublicFunction);
  } else if (typeof exports === 'object') { //Node for browserfy
    module.exports = createNativePublicFunction();
  } else {
    window.iFrameResize = createNativePublicFunction();
  }
  */

  /* always create a new public, probably we should adjust the name */
  window.iFrameResize = createNativePublicFunction();

  /* todo update outer hash when boundIFrame hash changes */

  // add IFrames to all div with class="at-app-embed"
  function createIFrames() {

    var ifs = document.getElementsByClassName("at-app-embed");
    for (var i = 0; i < ifs.length; i++) {
        createIFrameForDiv(ifs[i], i);
        
        if (ifs[i].getAttribute("mode") != "side") {
            ifs[i].style.position = "relative";
            ifs[i].style.zIndex = "20001";
        }
        
        var style = window.getComputedStyle(document.body);
        var bgColor = style.getPropertyValue("background-color");

        // use body background color if container has no background color assigned
        if (!ifs[i].style.backgroundColor) ifs[i].style.backgroundColor = bgColor;
        
    }

    var options = {};

    // process sendMessage from iFrame
    options.messageCallback = function (msg) {
     
      switch (msg.message.cmd) {

        // navigate main window to new url
        case 'navigate-to':
          var url = msg.message.url;
          window.location = url;
          break;

        case 'scroll-into-view':
          msg.iframe.scrollIntoView();
          msg.iframe.style.height = "98%";
          break;

        case 'scroll-to':
            msg.iframe.parentNode.scrollTop = msg.message.y;
            msg.iframe.parentNode.scrollLeft = msg.message.x;
            break;

        case 'position-push':
            this._positions = this._positions || [];

            var el = msg.iframe.parentNode;

            // when not running in side mode
            if (!msg.iframe.getAttribute("xsidemode")) {

                // we scroll the whole body and not just the container
                el = document.body;

                // show overlay when first push happens
                if (this._positions.length == 0) {

                    var mask = document.getElementById(msg.iframe.id + "mask");
                    if (mask) {
                        mask.style.display = "block";
                        mask.style.opacity = 0.77;
                    }
                }
            }

            this._positions.push({ x: el.scrollLeft, y: el.scrollTop });       
            
            el.scrollTop = msg.message.y;
            el.scrollLeft = msg.message.x;
            break;

        case 'position-pop':
            this._positions = this._positions || [];

            var el = msg.iframe.parentNode;
            if (!msg.iframe.getAttribute("xsidemode")) {
                // when not running in side mode we scroll the whole body and not just the container
                el = document.body;
            }

            if (this._positions.length) {
              var lp = this._positions.pop();
              el.scrollTop = lp.y;
              el.scrollLeft = lp.x;
            }

            if (!msg.iframe.getAttribute("xsidemode")) {
                // hide overlay after last pop
                if (this._positions.length == 0) {

                    var mask = document.getElementById(msg.iframe.id + "mask");
                    if (mask) {
                        mask.style.display = "none";
                        mask.style.opacity = 0;
                    }
                }
            }

            break;
      }
    }

    window.iFrameResize(options);

    for (var i = 0; i < ifs.length; i++) {
      var aae = document.getElementById("aae" + i);
      var url = aae.getAttribute("xsrc");
      var app = aae.getAttribute("xapp");

      if (i == 0) {
        window.iFrameResize.settings.boundIFrame = aae;

        var hash = window.location.hash || "";
        if (hash.indexOf("#!") == 0) {
          hash = hash.substr(2);
        } else if (hash.indexOf("#") == 0) {
          hash = hash.substr(1);
        }

        // if hash seems to be an app then replace default app 
        if (hash.indexOf("/") > 0) {
          app = hash;
        }
      }

      if (app) {
        url += "#!" + app;
      }
      aae.src = url;
    }
  }

  window.onhashchange = function () {

    if (window.iFrameResize.settings.boundIFrame == undefined) return;
    var aae = window.iFrameResize.settings.boundIFrame;
    var url = aae.getAttribute("xsrc");
    var app = aae.getAttribute("xapp");

    var hash = window.location.hash || "";
    if (hash.indexOf("#!") == 0) {
      hash = hash.substr(2);
    } else if (hash.indexOf("#") == 0) {
      hash = hash.substr(1);
    }

    // if hash seems to be an app then replace default app 
    if (hash.indexOf("/") > 0) {
      url += "#!" + hash;
      aae.src = url;
    }
  }

  function createIFrameForDiv(div, cntr) {
    var me = "/components/at-app-embed/at-app-embed.js";
    var serverUrl = "";
    var bodyOverflow = "";
    var sideMode = div.getAttribute("mode") == "side";
    var triggerId = div.getAttribute("trigger");
    var triggerEl;
    var style = "";

    if (triggerId) {
      triggerEl = document.getElementById(triggerId);
    }

    if (sideMode) {
      style = "display:none;background-color:#f9f9f9;width:400px;position:fixed;top: 0;z-index: 20001;height: 100vh;overflow-y: scroll;borderleft: 1px solid lightgrey;right: -400px;"
      style += "transform: translate3d(0, 0, 0);-webkit-transition: 0.3s;-moz-transition: 0.3s;-ms-transition: 0.3s;";

      div.setAttribute("style", style);
    }


    if (!!document.currentScript) {

      serverUrl = document.currentScript.src.toLowerCase();

    } else {

      // browser without currentScript
      for (var i = 0; i < document.scripts.length; i++) {
        if (document.scripts[i].src.indexOf(me) > 0) {
          serverUrl = document.scripts[i].src;
        }
      }
    }

    serverUrl = serverUrl.replace(me, "");

    var p = serverUrl.indexOf("?");
    if (p >= 0) serverUrl = serverUrl.substring(0, p);
    var src = div.getAttribute("src") || serverUrl + "/Embed";
    var app = div.getAttribute("app") || "";
    var ticket = div.getAttribute("ticket") || "";

    if(ticket) src = src + "?ticket="+ticket;

    var iframe = document.createElement('iframe');
    iframe.id = "aae" + cntr;
    iframe.frameBorder = 0;
    iframe.width = "100%";
    iframe.scrolling = "no";
    iframe.setAttribute("xsrc", src);
    iframe.setAttribute("xapp", app);

    if (sideMode) {
      iframe.setAttribute("xsidemode", "1");
    }

    div.appendChild(iframe);


      var mask = document.createElement('div');
      mask.id = "aae" + cntr + "mask";
      style = "display: none; position: fixed;top: 0;left: 0;right: 0;bottom: 0; background-color: #404040;-webkit-transform: translate3d(0, 0, 0);";
      style += "transform: translate3d(0, 0, 0);z-index: 20000;-webkit-transition: opacity 0.3s ease-in-out;-moz-transition: opacity 0.3s ease-in-out;-ms-transition: opacity 0.3s ease-in-out;";
      style += "-o-transition: opacity 0.3s ease-in-out;transition: opacity 0.3s ease-in-out;opacity:0";
      mask.setAttribute('style', style);

      // Prepend mask      
      div.parentNode.insertBefore(mask, div);

   if (sideMode) {
      if (!triggerEl) {
        alert("sidebar mode requires attribute trigger='id'");

      } else {

        triggerEl.onclick = function (e) {
          bodyOverflow = document.body.style.overflow;
          mask.style.display = "block";         
          div.style.display = "block";
          document.body.style.overflow = "hidden";
          setTimeout(function () {
            mask.style.opacity = 0.77;
            div.style.right = 0;
          }, 10);
          
        }
      }

      mask.onclick = function () {
        mask.style.opacity = 0;
        div.style.right = "-400px";     
        document.body.style.overflow = bodyOverflow;

        setTimeout(function () {
          div.style.display = "none";          
          mask.style.display = "none";
        }, 400);
      }

    }
  }

  createIFrames();

})();
