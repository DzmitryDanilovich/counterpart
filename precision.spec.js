var assert = require('assert');
var childProcess = require('child_process');
var Counterpart = require('./').Instance;

describe('translation precision', function() {
  function translate(format, values) {
    var instance = new Counterpart();
    instance.registerTranslations('en', { value: format });
    return instance.translate('value', values);
  }

  var zeros = new Array(101).join('0');
  var expected = {
    e: '1.' + zeros + 'e+0',
    f: '1.' + zeros,
    g: '1'
  };

  ['e', 'f', 'g'].forEach(function(type) {
    ['101', '999', new Array(401).join('9')].forEach(function(precision) {
      var label = precision.length > 3 ? '400 digits' : precision;
      it('bounds excessive ' + type + ' precision of ' + label, function() {
        assert.strictEqual(translate('%(p0).' + precision + type, { p0: 1 }), expected[type]);
      });
    });
  });

  it('formats zero significant digits as one significant digit', function() {
    assert.strictEqual(translate('%(p0).0g', { p0: 1 }), '1');
    assert.strictEqual(translate('%(p0).000g', { p0: 1 }), '1');
  });

  it('preserves zero decimal places', function() {
    assert.strictEqual(translate('%(p0).0f', { p0: 1.25 }), '1');
    assert.strictEqual(translate('%(p0).0e', { p0: 1.25 }), '1e+0');
  });

  it('preserves valid numeric precision and padding', function() {
    assert.strictEqual(translate('%(p0)+08.2f', { p0: 1.25 }), '+0001.25');
    assert.strictEqual(translate("%(p0)'%8.2f", { p0: 1.25 }), '%%%%1.25');
    assert.strictEqual(translate("%(p0)'%104.999f", { p0: 1 }), '%%' + expected.f);
    assert.strictEqual(translate('%(p0).100f', { p0: 1 }), expected.f);
  });

  it('preserves precision for string substitutions above 100 characters', function() {
    var value = new Array(251).join('a');
    assert.strictEqual(translate('%(p0).200s', { p0: value }), value.slice(0, 200));
    assert.strictEqual(translate('%(p0).0s', { p0: value }), '');
  });

  it('preserves escaped precision placeholders as literal text', function() {
    assert.strictEqual(translate('%%(p0).101f'), '%(p0).101f');
    assert.strictEqual(translate('%%%%(p0).0g'), '%%(p0).0g');
  });

  it('bounds a precision placeholder following an escaped percent', function() {
    assert.strictEqual(translate('%%%(p0).101f', { p0: 1 }), '%' + expected.f);
  });

  it('bounds precision for nested named values', function() {
    assert.strictEqual(translate('%(users[0].value).999f', { users: [{ value: 1 }] }), expected.f);
    assert.strictEqual(translate('%(_Value_2.child_3[0][1]).999f', {
      _Value_2: { child_3: [[0, 1]] }
    }), expected.f);
  });

  it('rejects percent signs in named argument keys', function() {
    assert.throws(function() {
      translate('%(invalid%key).999f', { 'invalid%key': 1 });
    }, SyntaxError);
  });

  it('rejects repeated unterminated named placeholders without blocking', function() {
    var script = [
      "var assert = require('assert');",
      'var Counterpart = require(process.argv[1]).Instance;',
      'var instance = new Counterpart();',
      "instance.registerTranslations('en', { value: new Array(131073).join('%(') });",
      "assert.throws(function() { instance.translate('value'); }, SyntaxError);"
    ].join('\n');
    var result = childProcess.spawnSync(process.execPath, ['-e', script, require.resolve('./')], {
      encoding: 'utf8',
      timeout: 2000
    });

    assert.ifError(result.error);
    assert.strictEqual(result.status, 0, result.stderr);
  });

  it('preserves numeric formatting for computed values', function() {
    assert.strictEqual(translate('%(p0).101f', { p0: function() { return 1; } }), expected.f);
  });

  it('leaves interpolation values containing precision specifiers untouched', function() {
    assert.strictEqual(translate('%(p0)s', { p0: '%.101f' }), '%.101f');
  });

  it('bounds registered interpolation values', function() {
    var instance = new Counterpart();
    instance.registerInterpolations({ p0: 1 });
    instance.registerTranslations('en', { value: '%(p0).101f' });
    assert.strictEqual(instance.translate('value'), expected.f);
  });

  it('bounds interpolated fallback translations', function() {
    var instance = new Counterpart();
    assert.strictEqual(instance.translate('missing', { fallback: '%(p0).101f', p0: 1 }), expected.f);
  });

  it('leaves precision placeholders untouched when interpolation is disabled', function() {
    assert.strictEqual(translate('%(p0).101f', { interpolate: false, p0: 1 }), '%(p0).101f');
  });

  it('preserves interpolation errors for missing values', function() {
    var instance = new Counterpart();
    instance.registerTranslations('en', { value: '%(missing).101f' });
    var received;
    instance.onError(function(error, entry, values) {
      received = { error: error, entry: entry, values: values };
    });

    assert.strictEqual(instance.translate('value', { p0: 1 }), null);
    assert.ok(received.error instanceof Error);
    assert.strictEqual(received.entry, '%(missing).101f');
    assert.strictEqual(received.values.p0, 1);
  });
});
