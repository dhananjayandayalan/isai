/*
 * Isai prototype — local stand-in for the design canvas runtime.
 * Renders the <x-dc> template in each *.dc.html screen with its
 * `class Component extends DCLogic` script, so the screens run on localhost.
 * Supports {{holes}}, <sc-for>, <sc-if>, onClick/onChange handlers and setState.
 * Prototype only; not part of the Isai web app.
 */
(function () {
  var hide = document.createElement('style');
  hide.textContent = 'x-dc{display:none!important}';
  document.head.appendChild(hide);

  var HOLE_ALL = /\{\{([^}]+)\}\}/g;
  var HOLE_ONE = /^\s*\{\{([^}]+)\}\}\s*$/;
  var PROPS = { checked: 1, value: 1, selected: 1, disabled: 1 };

  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    var q = path.match(/^(['"])(.*)\1$/);
    if (q) return q[2];
    var parts = path.split('.');
    var v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }

  function interpolate(str, scope) {
    return str.replace(HOLE_ALL, function (_, p) {
      var v = lookup(p, scope);
      return v == null ? '' : String(v);
    });
  }

  function child(scope, extra) {
    var s = Object.create(scope);
    for (var k in extra) s[k] = extra[k];
    return s;
  }

  function renderChildren(node, scope, out) {
    for (var c = node.firstChild; c; c = c.nextSibling) renderNode(c, scope, out);
  }

  function renderNode(node, scope, out) {
    if (node.nodeType === 3) {
      out.appendChild(document.createTextNode(interpolate(node.nodeValue, scope)));
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.localName.toLowerCase();
    if (tag === 'helmet' || tag === 'dc-import') return;
    if (tag === 'sc-for') {
      var m = (node.getAttribute('list') || '').match(HOLE_ONE);
      var list = m ? lookup(m[1], scope) : null;
      var as = node.getAttribute('as') || 'item';
      if (Array.isArray(list)) {
        list.forEach(function (item, i) {
          var extra = { $index: i };
          extra[as] = item;
          renderChildren(node, child(scope, extra), out);
        });
      }
      return;
    }
    if (tag === 'sc-if') {
      var mv = (node.getAttribute('value') || '').match(HOLE_ONE);
      if (mv ? lookup(mv[1], scope) : false) renderChildren(node, scope, out);
      return;
    }

    var el = node.namespaceURI && node.namespaceURI !== 'http://www.w3.org/1999/xhtml'
      ? document.createElementNS(node.namespaceURI, node.localName)
      : document.createElement(node.localName);

    for (var i = 0; i < node.attributes.length; i++) {
      var a = node.attributes[i];
      var name = a.name;
      if (name.indexOf('hint-') === 0) continue;
      var one = a.value.match(HOLE_ONE);
      if (one) {
        var v = lookup(one[1], scope);
        if (/^on[a-z]+$/.test(name) && typeof v === 'function') {
          el.addEventListener(name.slice(2), v);
        } else if (PROPS[name]) {
          if (v !== false && v != null) el.setAttribute(name, name === 'value' ? String(v) : '');
          el.__props = el.__props || {};
          el.__props[name] = v;
        } else if (v !== false && v != null) {
          el.setAttribute(name, String(v));
        }
      } else if (a.value.indexOf('{{') !== -1) {
        el.setAttribute(name, interpolate(a.value, scope));
      } else if (!/^on[a-z]+$/.test(name)) {
        el.setAttribute(name, a.value);
      }
    }
    renderChildren(node, scope, el);
    if (el.__props) for (var p in el.__props) el[p] = el.__props[p];
    out.appendChild(el);
  }

  function DCLogic(props) {
    this.props = props || {};
    this.state = {};
  }
  DCLogic.prototype.setState = function (patch) {
    var upd = typeof patch === 'function' ? patch(this.state, this.props) : patch;
    this.state = Object.assign({}, this.state, upd);
    schedule();
  };
  DCLogic.prototype.forceUpdate = function () { schedule(); };
  window.DCLogic = DCLogic;

  var tpl, inst, root, pending = false;

  function draw() {
    pending = false;
    var vals = inst.renderVals ? inst.renderVals() : {};
    var frag = document.createDocumentFragment();
    renderChildren(tpl.content, vals, frag);
    var y = window.scrollY;
    root.replaceChildren(frag);
    window.scrollTo(0, y);
  }

  function schedule() {
    if (pending || !inst) return;
    pending = true;
    Promise.resolve().then(draw);
  }

  function boot() {
    var xdc = document.querySelector('x-dc');
    var script = document.querySelector('script[data-dc-script]');
    if (!xdc) return;
    tpl = document.createElement('template');
    tpl.innerHTML = xdc.innerHTML;
    xdc.parentNode.removeChild(xdc);

    var helmet = tpl.content.querySelector('helmet');
    if (helmet) {
      Array.prototype.slice.call(helmet.children).forEach(function (n) {
        if (n.localName === 'link') {
          var l = document.createElement('link');
          for (var i = 0; i < n.attributes.length; i++) l.setAttribute(n.attributes[i].name, n.attributes[i].value);
          document.head.appendChild(l);
        } else if (n.localName === 'style') {
          var s = document.createElement('style');
          s.textContent = n.textContent;
          document.head.appendChild(s);
        }
      });
    }

    var props = {};
    if (script) {
      try {
        var decl = JSON.parse(script.getAttribute('data-props') || '{}');
        Object.keys(decl).forEach(function (k) {
          if (k.charAt(0) !== '$' && decl[k] && 'default' in decl[k]) props[k] = decl[k].default;
        });
      } catch (e) { console.warn('[isai-proto] bad data-props', e); }
    }
    // Tweaks can be overridden from the URL: Practice.dc.html?startMode=performance
    new URLSearchParams(location.search).forEach(function (v, k) {
      props[k] = v === 'true' ? true : v === 'false' ? false : v;
    });

    var Component = DCLogic;
    if (script) {
      Component = new Function('DCLogic', script.textContent + '\n;return Component;')(DCLogic);
    }
    inst = new Component(props);
    inst.props = props;

    root = document.createElement('div');
    root.id = 'dc-root';
    document.body.insertBefore(root, document.body.firstChild);
    draw();
    if (inst.componentDidMount) inst.componentDidMount();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
