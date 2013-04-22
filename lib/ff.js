/*
 Copyright (c) 2011 Tim Caswell <tim@creationix.com>
 Copyright (c) 2012 Marcus Cavanaugh <m@mcav.com>
 Copyright (c) 2012 Michael Henretty <michael.henretty@gmail.com>

 MIT License

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 */

// This is ff, by Marcus Cavanaugh and Michael Henretty.
// It was inspired by TwoStep by Tim Caswell (https://gist.github.com/1524578),
// which was in turn inspired by Will Conant's flow-js.

(function () {

	var slice = Array.prototype.slice;

	function isPromise(maybePromise) {
		return maybePromise && typeof maybePromise.then === "function";
	}

	function copyToFunction (group, f) {
		for (var method in group) {
			if (typeof group[method] === "function") {
				f[method] = (function(method) {
					return function() {
						return group[method].apply(group, arguments);
					};
				})(method);
			}
		}
	}

	//****************************************************************

	function Group(superGroup, callback, firstSlotCallback) {
		this.args = [null];
		this.left = 0;
		this.callback = callback;
		this.isDone = false;
		this.firstSlotCallback = firstSlotCallback; // mcav
		this.superGroup = superGroup;
	}

	Group.prototype.done = function done() {
		if (this.isDone) return;
		this.isDone = true;
		this.callback.apply(null, this.args);
	};

	Group.prototype.succeed = function () {
		if (this.isDone) return;
		this.isDone = true;
		this.superGroup.result = [null].concat(slice.call(arguments));
		
		if (!this.superGroup.started) {
			// if we didn't start the chain of .next() steps,
			// just call the final results immediately.
			this.superGroup._runResultHandlers.apply(this.superGroup, this.superGroup.result);
		}
	};

	Group.prototype.fail = function (err) {
		if (this.isDone) return;
		this.isDone = true;
		this.superGroup.result = [err];
		this.superGroup.isError = true;
		if (!this.superGroup.started) {
			// if we didn't start the chain of .next() steps,
			// just call the final results immediately.
			this.superGroup._runResultHandlers.apply(this.superGroup, this.superGroup.result);
		}
	};

	Group.prototype.error = function error(err) {
		if (this.isDone) return;
		this.isDone = true;
		this.superGroup.isError = true;
		var callback = this.callback;
		callback(err);
	};

	Group.prototype.pass = function () {
		for (var i = 0, l = arguments.length; i < l; i++) {
			this.args.push(arguments[i]);
		}
	};

	// Simple utility for passing a sync value to the next step.
	Group.prototype.slot = function () {
		if (arguments.length > 0) {
			this.pass.apply(this, slice.call(arguments));
		} else {
			return this.slotMulti(1);
		}
	};

	// Register a slot in the next step and return a callback
	Group.prototype.slotMulti = function (argLength) {
		if (!argLength) argLength = 1;
		var group = this;
		var index = group.args.length;
		group.args.length += argLength;
		group.left++;
		if (this.firstSlotCallback) { // mcav
			this.firstSlotCallback();
			this.firstSlotCallback = null;
		}
		return function (err) {
			if (err) return group.error(err);
			var values = slice.call(arguments, 1);
			for (var i = 0; i < argLength; i++) {
				group.args[index + i] = values[i];
			}
			if (--group.left === 0) group.done();
		};
	};

	// Register a slot in the next function which includes first param
	Group.prototype.slotPlain = function slotPlain(argLength) {
		var group = this;
		var slot = group.slotMulti(argLength);
		return function () {
			slot.apply(group, [null].concat(slice.call(arguments)));
		}
	};

	// Block on this callback, but dont slot data
	Group.prototype.wait = function wait() {
		var group = this;
		group.left++;
		if (this.firstSlotCallback) { // mcav
			this.firstSlotCallback();
			this.firstSlotCallback = null;
		}
		return function (err, data) {
			if (err) return group.error(err);
			if (--group.left === 0) group.done();
		};
	};

	// Wait, but don't forward error
	Group.prototype.waitPlain = function waitPlain() {
		var group = this;
		var wait = this.wait();
		return function () {
			wait.apply(group, [null].concat(slice.call(arguments)));
		}
	};

	// Creates a nested group where several callbacks go into a single array.
	Group.prototype.group = function group() {
		var group = this;
		var index = this.args.length++;
        group.args[index] = [];
		var subgroup = new Group(this.superGroup, function (err) {
			if (err) return group.error(err);
			var data = slice.call(arguments, 1);
			group.args[index] = data;
			if (--group.left === 0) group.done();
		}, function () {
			group.left++;
		});

		var f = function () {
			return subgroup.slot.apply(subgroup, arguments);
		};
		
		copyToFunction(subgroup, f);

		return f;
	};

	// global group
	function SuperGroup(args) {
		var context;
		if (typeof args[0] === "function") {
			context = null;
		} else {
			context = args.shift();
		}
		
		this.currentGroup = new Group(this, function () {});
		this.context = context;
		this.steps = [];
		this.resultHandlers = [];
		this.started = false;
		this.result = null;
		this.hasErrorCallback = false;

		args.forEach(function (fn) {
			fn && this.next(fn);
		}, this);
	}

	for (var method in Group.prototype) if (Group.prototype.hasOwnProperty(method)) {
		SuperGroup.prototype[method] = (
			function (method) {
				return function () {
					if (this.currentGroup) {
						return this.currentGroup[method].apply(this.currentGroup, arguments);
					}
				};
			})(method);
	}

	/**
	 * Call this function regardless of whether or not an error has
	 * propagated down the chain. You'll usually want to call this at the
	 * end of your chain.
	 */
	SuperGroup.prototype.onComplete = function (cb, _onlySuccess) {
		if (!cb) { return this.f; }
		if (!_onlySuccess) {
			this.hasErrorCallback = true;
		}
		if (this.result) {
			this._runResult(cb, this.result);
		} else {
			this.resultHandlers.push(cb);
		}
		return this.f;
	}
	
	// backwards compatibility
	SuperGroup.prototype.cb = SuperGroup.prototype.onComplete;
	SuperGroup.prototype.success = SuperGroup.prototype.onSuccess;
	SuperGroup.prototype.error = SuperGroup.prototype.onError;

	/**
	 * If and only if there was no error (this far in the chain), call cb
	 * WITHOUT passing any error at all. Again, error won't be null, it'll
	 * not be passed at all. Your function should only accept the next
	 * arguments.
	 */
	SuperGroup.prototype.onSuccess =  function (cb) {
		if (!cb) { return this.f; }
		return this.onComplete(function() {
			!this.isError && cb.apply(this, slice.call(arguments, 1));
		}.bind(this), true);
	}

	/**
	 * If and only if there was an error, call cb with the
	 * error as an argument.
	 */
	SuperGroup.prototype.onError = function (cb) {
		if (!cb) { return this.f; }
		return this.onComplete(function() {
			this.isError && cb.apply(this, arguments);
		}.bind(this)); 
	}

	SuperGroup.prototype.then = function (onSuccess, onError) {
		var defer = ff.defer();
		this.onSuccess(function () {
			try {
				if (typeof onSuccess !== "function") {
					defer.apply(this, slice.call(arguments));
				} else {
					var value = onSuccess.apply(this, slice.call(arguments));
					if (isPromise(value)) {
						value.then(defer, defer.fail);
					} else {
						defer(value);
					}
				}
			} catch (e) {
				defer.fail(e);
			}
		});
		this.onError(function () {
			try {
				if (typeof onError !== "function") {
					defer.fail.apply(this, slice.call(arguments));
				} else {
					var value = onError.apply(this, slice.call(arguments));
					if (isPromise(value)) {
						value.then(defer, defer.fail);
					} else {
						defer(value);
					}
				}
			} catch (e) {
				defer.fail(e);
			}
		});
		return defer;
	}

	SuperGroup.prototype.next = function (cb) {
		this.steps.push(cb);
		return this.f;
	}

	SuperGroup.prototype.timeout = function (milliseconds) {
		if (!this.result) {
			if (this._timeout) {
				clearTimeout(this._timeout);
			}
			this._timeout = setTimeout(function () {
				this.fail(new Error("ff timeout"));
				// we might not have run the result handler previously:
				this._runResultHandlers.apply(this, this.result);
			}.bind(this), milliseconds);
		}
		
		return this.f;
	}

	//****************************************************************

	// Stepper function
	SuperGroup.prototype._execNextStep = function(err) {
		if (this.result) {
			return;
		}
		
		this.started = true;
		
		var step = this.steps.shift();
		if (err || !step) {
			this._runResultHandlers.apply(this, arguments);
		} else {
			var group = new Group(this, this._execNextStep.bind(this));
			try {
				// make sure next function isnt applied
				// until current function has completed
				group.left++;
				this.currentGroup = group;
				step.apply(this.context || this, slice.call(arguments, 1));
				group.left--;
				if (this.result) {
					this._runResultHandlers.apply(this, this.result);
					return;
				}
				
			} catch (e) {
				group.left--;
				
				if ((e instanceof ReferenceError) || 
					(e instanceof SyntaxError)) {
					e._rethrow = true;
				}
				if (e._rethrow) {
					delete e._rethrow;
					throw e;
				}
				group.error(e);
			}
			if (group.left === 0) group.done();
		}
	}

	// run a single result handler
	SuperGroup.prototype._runResult = function (handler, args) {
		// fire in a timeout so that if any handler throws an
		// exception ff will continue to execute and the
		// exception will be reported as unhandled (in node) or in the web
		// console (in the browser)
		setTimeout(function () {
			handler && handler.apply(this.context || this, args);
		}.bind(this), 0);
	}

	// run all the registered result handlers
	SuperGroup.prototype._runResultHandlers = function (err) {
		if (this._finished) { return; }
		this._finished = true;
		
		if (this._timeout) {
			clearTimeout(this._timeout);
		}

		// if an error occurred during the callback chain and no one
		// attached an error handler, make sure we rethrow it
		if (this.isError && !this.hasErrorCallback && this.started) {
			this.resultHandlers.push(function(err) {
				err._rethrow = true;
				this.f && this.f.debug && console.log("Unhandled ff error:", err, err && err.stack);
				throw err;
			}.bind(this));
		}
		
		this.result = slice.call(arguments);
		
		this.currentGroup = null;
		
		
		var args = arguments;
		this.resultHandlers.forEach(function (handler) {
			this._runResult(handler, args);
		}.bind(this));
		
		this.resultHandlers.length = 0; // null it out
	}

	//****************************************************************

	function ff() {
		var superGroup = new SuperGroup(slice.call(arguments));

		// execute steps in next tick
		var f = function () {
			return superGroup.slot.apply(superGroup, arguments);
		};

		superGroup.f = f;
		copyToFunction(superGroup, f);

		// begin executing steps next time we yield to event loop
		setTimeout(function(){ superGroup._execNextStep(); }, 0);

		return f;
	}

	ff.defer = function () {
		var superGroup = new SuperGroup(slice.call(arguments));

		var f = function () {
			if (!superGroup.started) {
				superGroup._execNextStep.apply(superGroup, [null].concat(slice.call(arguments)));
			} else {
				return superGroup.slot.apply(superGroup, arguments);
			}
		};
		
		superGroup.f = f;
		copyToFunction(superGroup, f);

		return f;
	}

	//****************************************************************

	// AMD // RequireJS
	if (typeof define !== 'undefined' && define.amd) {
		define([], function () {
			return ff;
		});
	// Node.js
	} else if (typeof module !== 'undefined') {
		module.exports = ff;
	// js.io
	} else if (typeof exports !== 'undefined') {
		exports = ff;
	// browser
	} else {
		this.ff = ff;
	}
}());