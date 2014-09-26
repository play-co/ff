var ff = require("../lib/ff");

module.exports.pending = function () {
	var f = ff.defer();

	return {
		promise: f,
		fulfill: function (value) {
			f(value);
		},
		reject: function (reason) {
			f.fail(reason);
		}
	};
};