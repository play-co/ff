(function () {
	if (typeof module !== "undefined") {
		var ff = require("../lib/ff");
	}

	var adapter = {
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
		module.exports = adapter;
	} else if (typeof exports !== 'undefined') {
		exports = adapter; // jsio
	} else {
		this.adapter = adapter;
	}
}());