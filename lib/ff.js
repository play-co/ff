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

if (typeof exports !== 'undefined') {
	exports = ff; // jsio
}
if (typeof module !== 'undefined') {
	module.exports = ff;
}

var slice = Array.prototype.slice;

function copyToFunction (group, f) {
	for (var method in group) {
		f[method] = (function(method) {
			return function() {
				return group[method].apply(group, arguments);
			};
		})(method);
	}
}

// custom error used to break out of step
function DoneError(args) {
	this.args = args; // should be passed to result, if exists
	this.name = "DoneError";
	this.message = "Group done";
}
DoneError.prototype = new Error();

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
	
	if (!this.superGroup._started) {
		// if we didn't start the chain of .next() steps,
		// just call the final results immediately.
		this.superGroup._runResultHandlers.apply(this.superGroup, this.superGroup.result);
	}
};

Group.prototype.fail = function (err) {
	if (this.isDone) return;
	this.isDone = true;
	if (err == null) {
		err = new Error("f.fail()");
	}
	this.superGroup.result = [err];
	if (!this.superGroup._started) {
		// if we didn't start the chain of .next() steps,
		// just call the final results immediately.
		this.superGroup._runResultHandlers.apply(this.superGroup, this.superGroup.result);
	}
};

// DEPRECATED:
Group.prototype.exit = function exit() {
	if (this.isDone) return;
	this.isDone = true;
	throw new DoneError();
};

Group.prototype.error = function error(err) {
	if (this.isDone) return;
	this.isDone = true;
	var callback = this.callback;
	callback(err);
};

// Simple utility for passing a sync value to the next step.
Group.prototype.slot = function () {
	if (arguments.length > 0) {
		for (var i = 0, l = arguments.length; i < l; i++) {
			this.args.push(arguments[i]);
		}
	} else {
		return this.slotMulti(1);
	}
};

// Register a slot in the next step and return a callback
Group.prototype.slotMulti = function (argLength) {
	this.debug && console.log("slotting", this.left);
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
		group.debug && console.log("slot DONE", group.left);
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
	this.debug && console.log("slotting (no error)", this.left);
	var group = this;
	var slot = group.slotMulti(argLength);
	return function () {
		group.debug && console.log("slot DONE (no error)", group.left);
		slot.apply(group, [null].concat(slice.call(arguments)));
	}
};

// Block on this callback, but dont slot data
Group.prototype.wait = function wait() {
	this.debug && console.log("waiting", this.left);
	var group = this;
	group.left++;
	if (this.firstSlotCallback) { // mcav
		this.firstSlotCallback();
		this.firstSlotCallback = null;
	}
	return function (err, data) {
		group.debug && console.log("wait DONE", group.left);
		if (err) return group.error(err);
		if (--group.left === 0) group.done();
	};
};

// Wait, but don't forward error
Group.prototype.waitPlain = function waitPlain() {
	this.debug && console.log("waiting (no error)", this.left);
	var group = this;
	var wait = this.wait();
	return function () {
		group.debug && console.log("wait DONE (no error)", group.left);
		wait.apply(group, [null].concat(slice.call(arguments)));
	}
};

// Creates a nested group where several callbacks go into a single array.
Group.prototype.group = function group() {
	var group = this;
	var index = this.args.length++;
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

// backwards-compatibility:
Group.prototype.makeGroup = Group.prototype.group;
Group.prototype.slotNoError = Group.prototype.slotPlain;
Group.prototype.waitNoError = Group.prototype.waitPlain;
Group.prototype.pass = Group.prototype.slot;

// global group
function SuperGroup(args) {
	var context;
	if (typeof args[0] === "function") {
		context = null;
	} else {
		context = args.shift();
	}
	
	this.f = null; // the chaining f function
	this.currentGroup = new Group(this, function () {});
	this.context = context;
	this.steps = [];
	this.completionHandlers = [];
	this._started = false;
	this.result = null;

	args.forEach(function (fn) {
		if (fn) {
			if (fn._ffMethod) { // backwards-compat
				this[fn._ffMethod](fn);
			} else {
				this.next(fn);
			}
		}
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

//****************************************************************
// Completion Handlers

/**
 * Call this function regardless of whether or not an error has
 * propagated down the chain. You'll usually want to call this at the
 * end of your chain.
 */
SuperGroup.prototype.cb = function (cb, _onlySuccess) {
	if (!_onlySuccess) {
		this._hasErrorCallback = true;
	}
	if (this.result) {
		cb && cb.apply(this.context || this, this.result);
	} else {
		cb && this.completionHandlers.push(cb);
	}
	return this.f;
}

/**
 * If and only if there was no error (this far in the chain), call cb
 * WITHOUT passing any error at all. Again, error won't be null, it'll
 * not be passed at all. Your function should only accept the next
 * arguments.
 */
SuperGroup.prototype.success = function (cb) {
	return this.cb(function(err) {
		!err && cb.apply(this, slice.call(arguments, 1));
	}, true);
}

/**
 * If and only if there was an error, call cb with the
 * error as an argument.
 */
SuperGroup.prototype.error = SuperGroup.prototype.failure = function (cb) {
	return this.cb(function(err) {
		err && cb.apply(this, arguments);
	}); 
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
			this.fail(new Error("timeout"));
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
	
	this._started = true;
	
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
				e.rethrow = true;
			}
			if (e instanceof DoneError) {
				return; // don't call anything else (exit()); deprecated.
			} else if (e.rethrow) {
				throw e;
			}
			group.error(e);
		}
		if (group.left === 0) group.done();
	}
}

SuperGroup.prototype._runResultHandlers = function (err) {
	if (this._finished) { return; }
	this._finished = true;
	
	if (this._timeout) {
		clearTimeout(this._timeout);
	}

	// if we're running the callback chain, an error occured, and no one
	// attached an error handler, log it out with ff.onerror.
	if (!this._hasErrorCallback && err && this._started) {
		this.completionHandlers.push(ff.onerror);
	}
	
	this.result = slice.call(arguments);
	
	this.currentGroup = null;
	
	// fire these in a timeout so that if any handler throws an
	// exception, the rest of the handlers will get called, and the
	// exception will be reported as unhandled (in node) or in the web
	// console (in the browser)
	var args = arguments;
	
	this.completionHandlers.forEach(function (handler) {
		setTimeout(function () {
			handler && handler.apply(this.context || this, args);
		}.bind(this), 0);
	}, this);
	
	this.completionHandlers.length = 0; // null it out
}

//****************************************************************

function ff(context) {
	var superGroup = new SuperGroup(slice.call(arguments));

	// execute steps in next tick
	var f = function () {
		return superGroup.slot.apply(superGroup, arguments);
	};
	
	setTimeout(function(){ superGroup._execNextStep(); }, 0);

	superGroup.f = f;
	copyToFunction(superGroup, f);
	return f;
}

ff.defer = function (context) {
	var superGroup = new SuperGroup(slice.call(arguments));

	var f = function () {
		if (!superGroup._started) {
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

ff.onerror = function(err) {
	err.rethrow = true;
	console.log("Unhandled ff error:", err, err && err.stack);
	throw err;
}

// backwards-compatibility (disregard):

ff.cb = function (fn) {
	if (fn) {
		fn._ffMethod = 'cb';
	}
	return fn;
}

ff.error = function (fn) {
	if (fn) {
		fn._ffMethod = 'error';
	}
	return fn;
}

ff.success = function (fn) {
	if (fn) {
		fn._ffMethod = 'success';
	}
	return fn;
}

