if (typeof module !== "undefined") {
	var ff = require("../lib/ff");
	var chai = require("chai");
}
var assert = chai.assert;

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

	describe("#timeout()", function () {
		it("should timeout", function (done) {
			var f = ff(function () {
				f.timeout(20);
				setTimeout(f(), 100);
			}).error(function (e) {
				assert.equal(e.message, "timeout");
				done();
			}).success(function() {
				assert.fail();
			});
		});

		it("should timeout with defer", function (done) {
			var f = ff.defer();
			f.timeout(20);
			setTimeout(function () {
				f();
			}, 100);
			
			f.error(function (e) {
				assert.equal(e.message, "timeout");
				done();
			});
			f.success(function() {
				assert.fail();
			});
		});

		it("should not timeout", function (done) {
			var f = ff(function () {
				f.timeout(200);
				setTimeout(f(), 10);
			}).error(function (e) {
				assert.fail();
			}).success(function() {
				done();
			});
		});
	});

	describe("#succeed()", function () {
		it("should work", function (done) {
			ff(function () {
				this.succeed(2, 3);
			}, function () {
				assert.fail();
			}).cb(function(err, two, three) {
				assert(two == 2 && three == 3);
				done();
			});
		});
	});

	describe("#fail()", function () {
		it("should work", function (done) {
			ff(function () {
				try {
					this.fail(4);
				} catch(e) {
				}
			}, function () {
				assert.fail();
			}).cb(function(err, two) {
				assert(err == 4 && !two);
				done();
			});
		});
	});

	describe("#exceptions()", function () {
		it("should be propagated", function (done) {
			// in node we register with an unhandled exception in the process object
			// in the browser we user the window.onerror method to handle uncaught errors
			if (typeof module !== "undefined") {
				function caught () {
					process.listeners('uncaughtException').push(originalListener);
					done();
				}
				var originalListener = process.listeners('uncaughtException').pop();
				process.once('uncaughtException', caught);
			} else {
				window.onerror = function () {
					done();
				}
			}
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

	describe("#defer()", function () {
		it("should work", function (done) {
			var f = ff.defer(this);
			var completed = false;
			setTimeout(function() { assert(!completed); }, 20);
			
			f.success(function() { completed = true; });
			
			setTimeout(function() {
				f("OK");
			}, 30);

			setTimeout(function() {
				assert(completed);
				done();
			}, 50);
		});

		it("should retroactively succeed", function (done) {
			var f = ff.defer(this);
			f("ok");
			f.success(function() {
				done();
			});
		});

		it("should retroactively fail", function (done) {
			var f = ff.defer(this);
			f.fail(4);
			f.failure(function(n) {
				done();
			});
		});

		it("should call fns", function (done) {
			var n = 0;
			var f = ff.defer(this, function(x){
				assert(x == 2);
				f(x);
				n++;
			}, function (x) {
				assert(x == 2);
				n++;
			}).cb(function(e) {
				if (e) throw e;
				assert(n == 2);
				done();
			});
			f(2);
		});
		
		it("should call multiple handlers", function (done) {
			var f = ff.defer(this);
			f.fail(4);
			f.success(function(n) {
				assert.fail();
			});
			var n = 0;
			f.failure(function() {
				n++;
			});
			f.failure(function() {
				assert(n == 1);
				done();
			});
		});
	});
});

describe("Misc", function () {
	it("should not pollute global namespace", function (done) {
		if (typeof copyToFunction !== "undefined" 
			|| typeof Group !== "undefined"
			|| typeof SuperGroup !== "undefined"
			|| typeof DoneError !== "undefined"
		) {
			done("global namespace polluted");
		} else {
			done();
		}
	});
});
