if (typeof module !== "undefined") {
	var ff = require("../lib/ff");
	var chai = require("chai");
}
var assert = chai.assert;

describe("ff", function () {

	describe("#slot() as pass", function () {
		it("should pass a reference to the next step", function (done) {
			var f = ff(function () {
				var foo = { bar: false };
				f.slot(foo);
				foo.bar = true;
			}, function (foo) {
				assert(foo);
				assert(foo.bar);
			}).onSuccess(done);
		});
	});

	describe("#slot() as callback", function () {
		it("should pass values to the next function in slotted order", function (done) {
			var f = ff(function () {
				var one = f.slot();
				var two = f.slot();

				setTimeout(function () {
					one(null, 1);
				}, 300);

				setTimeout(function () {
					two(null, 2);
				}, 200)
			}, function (one, two) {
				assert.equal(one, 1);
				assert.equal(two, 2);
			}).onSuccess(done);
		});
	});

	describe("#onError()", function () {
		it("should forward errors to the error callback", function (done) {
			var f = ff(function () {
				throw "go straight to onError";
			}, function () {
				assert.fail();
			}).onSuccess(function () {
				assert.fail();
			}).onError(function (err) {
				assert.equal(err, "go straight to onError");
				done();
			});
		});

		it("error callback should not be called", function (done) {
			var f = ff(function () {
				// do nothing
			}).onError(function () {
				assert.fail();
			}).onSuccess(done);
		});
	});

	// TODO: add break functionality
	// describe("#break()", function () {
	// 	it("should break out of execution immediately", function (done) {
	// 		ff(function () {
	// 			setTimeout(done, 100);
	// 			this.break();
	// 		}, function () {
	// 			assert.fail();
	// 		}, ff.error(function () {
	// 			assert.fail();
	// 		}));
	// 	});
	// });

	describe("#timeout()", function () {
		it("should timeout", function (done) {
			var f = ff(function () {
				setTimeout(f(), 100);
			}).timeout(20);

			// success handler should not be called
			f.onSuccess(function () {
				assert.fail();
			});

			// ff should timeout, and give us timeout message
			f.onError(function (err) {
				assert.equal(err.message, "ff timeout");
				done();
			});
		});

		it("should timeout with defer", function (done) {
			var f = ff.defer();
			f.timeout(20);
			setTimeout(function () {
				f();
			}, 100);

			f.onSuccess(function() {
				assert.fail();
			});

			f.onError(function (e) {
				assert.equal(e.message, "ff timeout");
				done();
			});
		});

		it("should not timeout", function (done) {
			var f = ff(function () {
				setTimeout(f(), 10);
			}).onError(function (e) {
				assert.fail();
			}).onSuccess(function() {
				done();
			});

			f.timeout(200);
		});
	});

	describe("#succeed()", function () {
		it("should work", function (done) {
			var f = ff(function () {
				f.succeed(2, 3);
			}, function () {
				assert.fail();
			}).onSuccess(function(two, three) {
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
			function handleError(err) {
				if (err === "handle this error") {
					done();
				} else {
					assert.fail();
				}
			}

			// in node we register with an unhandled exception in the process object
			// in the browser we user the window.onerror method to handle uncaught errors
			if (typeof module !== "undefined") {
				var originalListener = process.listeners('uncaughtException').pop();
				process.once('uncaughtException', function () {
					process.listeners('uncaughtException').push(originalListener);
					handleError.apply(null, Array.prototype.slice.call(arguments));
				});
			} else {
				window.onerror = function () {
					// window.onerror does not propogate the original thrown excpetion
					// so manually pass in our expected error value
					handleError("handle this error");
				};
			}
 			ff(function () {
				throw "handle this error";
			}, function () {
				assert.fail();
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
			var f = ff(context, function () {
				var foo = { bar: false };
				f(foo);
				foo.bar = true;
			}, function (foo) {
				assert(foo);
				assert(foo.bar);
				// test context
				assert(this.foo);
			}).onSuccess(done);
		});
	});

	describe("#slot()", function () {
		it("should retain scope of current object", function (done) {
			var context = {
				test: function () {
					var f = ff(this, function () {
						var one = f.slot();
						var two = f.slot();

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
					}).onSuccess(done);
				}
			};
			context.test();
		});
	});
});

describe("ff, defer", function () {
	it("should work", function (done) {
		var f = ff.defer(this);
		var completed = false;
		setTimeout(function() { assert(!completed); }, 20);
		
		f.onSuccess(function() { completed = true; });
		
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
		f.onSuccess(function() {
			done();
		});
	});

	it("should retroactively fail", function (done) {
		var f = ff.defer(this);
		f.fail(4);
		f.onError(function(n) {
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
		f.onSuccess(function(n) {
			assert.fail();
		});
		var n = 0;
		f.onError(function() {
			n++;
		});
		f.onError(function() {
			assert(n == 1);
			done();
		});
	});
});

describe("ff, promises A+", function () {
	if (typeof module !== "undefined") {
		var adaptor = require("./promise-adaptor");
		var promisesTest = require("promises-aplus-tests");
	}

	it("should pass the a+ test suite", function (done) {
		promisesTest(adaptor, function (err) {
			assert(!err);
			done();
		})
	});
});

describe("misc", function () {
	it("should not pollute global namespace", function (done) {
		if (typeof copyToFunction !== "undefined" 
			|| typeof Group !== "undefined"
			|| typeof SuperGroup !== "undefined"
		) {
			done("global namespace polluted");
		} else {
			done();
		}
	});
});
