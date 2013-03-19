(function () {
	if (typeof module !== "undefined") {
		var ff = require("../lib/ff");
	}

	var adaptor = {
		pending: function () {
			var f = ff.defer();
			return {
				promise: f,
				fulfill: function (value) {
					f(value);
				},
				reject: function (reason) {
					f.fail(reason);
				}
			}
		}
	};

	if (typeof module !== 'undefined') {
		module.exports = adaptor;
	} else if (typeof exports !== 'undefined') {
		exports = adaptor; // jsio
	} else {
		this.adaptor = adaptor;
	}
}());