var assert = require("assert");
var ff = require("../lib/ff");

describe("ff", function () {

	describe("#pass()", function () {
		it("should pass a reference to the next step", function (done) {
			ff(function () {
				var foo = { bar: false };
				this.pass(foo);
				foo.bar = true;
			}, function (foo) {
				assert(foo);
				assert(foo.bar);
			}, ff.cb(done));
		});
	});

	describe("#slot()", function () {
		it("should pass values to the next function in slotted order", function (done) {
			ff(function () {
				var one = this.slot();
				var two = this.slot();

				setTimeout(function () {
					one(null, 1);
				}, 300);

				setTimeout(function () {
					two(null, 2);
				}, 200)
			}, function (one, two) {
				assert.equal(one, 1);
				assert.equal(two, 2);
			}, ff.cb(done));
		});
	});

	describe("#error()", function () {
		it("should forward errors to the error callback", function (done) {
			ff(function () {
				throw "go straight to error";
			}, function () {
				assert.fail();
			}, ff.error(function (err) {
				assert.equal(err, "go straight to error");
				done();
			}));
		});

		it("should forward errors to the error callback", function (done) {
			ff(function () {
				// do nothing
			}, ff.cb(done), ff.error(function (err) {
				assert.fail();
			}));
		});
	});

	describe("#done()", function () {
		it("should break out of execution immediately", function (done) {
			ff(function () {
				setTimeout(done, 100);
				this.exit();
			}, function () {
				assert.fail();
			}, ff.error(function () {
				assert.fail();
			}));
		});
	});

	describe("#exceptions()", function () {
		it("should be propagated", function (done) {
			function caught () {
				process.listeners('uncaughtException').push(originalListener);
				done();
			}
			var originalListener = process.listeners('uncaughtException').pop();
			process.once('uncaughtException', caught);
 			ff(function () {
				throw 4;
			}, function () {
			});
		});
	});

});

describe("ff, with context", function () {

	describe("#pass()", function () {
		it("`this` should revert to newly created object", function (done) {
			function MyContext() {
				this.foo = true;
			}
			var context = new MyContext();
			var sg = ff(context, function () {
				var foo = { bar: false };
				sg.pass(foo);
				foo.bar = true;
			}, function (foo) {
				assert(foo);
				assert(foo.bar);
				// test context
				assert(this.foo);
			}, ff.cb(done));
		});
	});

	describe("#slot()", function () {
		it("should retain scope of current object", function (done) {
			var context = {
				test: function () {
					var sg = ff(this, function () {
						var one = sg.slot();
						var two = sg.slot();

						setTimeout(function () {
							one(null, 1);
						}, 300);

						setTimeout(function () {
							two(null, 2);
						}, 200)
					}, function (one, two) {
						assert.equal(one, 1);
						assert.equal(two, 2);
						assert.equal(typeof this.test, "function");
					}, ff.cb(done));
				}
			};
			context.test();
		});
	});
});

describe("ff, new-style", function () {

	describe("#pass()", function () {
		it("`this` should revert to newly created object", function (done) {
			function MyContext() {
				this.foo = true;
			}
			var context = new MyContext();
			var sg = ff(context, function () {
				var foo = { bar: false };
				sg(foo, foo);
				foo.bar = true;
			}, function (foo, alsoFoo) {
				assert(foo);
				assert(foo.bar);
				assert(alsoFoo.bar);
				// test context
				assert(this.foo);
			}, ff.cb(done));
		});
	});

	describe("#slot()", function () {
		it("should retain scope of current object", function (done) {
			var context = {
				test: function () {
					var sg = ff(this, function () {
						var one = sg();
						var two = sg();

						setTimeout(function () {
							one(null, 1);
						}, 300);

						setTimeout(function () {
							two(null, 2);
						}, 200)
					}, function (one, two) {
						assert.equal(one, 1);
						assert.equal(two, 2);
						assert.equal(typeof this.test, "function");
					}, ff.cb(done));
				}
			};
			context.test();
		});
	});
});