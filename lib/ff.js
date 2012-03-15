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

// Inspired by http://github.com/willconant/flow-js, but reimplemented and
// modified to fit my taste and the node.JS error handling system.

// using TwoStep via https://gist.github.com/1524578#comments - mcav

module.exports = ff;

var slice = Array.prototype.slice;
var DONE_EXCEPTION = "GroupDone";

function Group(callback, firstSlotCallback) {
	this.args = [null];
	this.left = 0;
	this.callback = callback;
	this.isDone = false;
	this.firstSlotCallback = firstSlotCallback; // mcav
}

Group.prototype.done = function done() {
	if (this.isDone) return;
	this.isDone = true;
	this.callback.apply(null, this.args);
};

// added by mcav -- break out of the ff
Group.prototype.exit = function exit() {
	if (this.isDone) return;
	this.isDone = true;
	throw DONE_EXCEPTION;
};

Group.prototype.error = function error(err) {
	if (this.isDone) return;
	this.isDone = true;
	var callback = this.callback;
	callback(err);
};

// Simple utility for passing a sync value to the next step.
Group.prototype.pass = function pass() {
	var values = slice.call(arguments);
	for (var i = 0, l = values.length; i < l; i++) {
		this.args.push(values[i]);
	}
};

// Register a slot in the next step and return a callback
Group.prototype.slot = function slot() {
	
	if (arguments.length) {
		for (var i = 0; i < arguments.length; i++) {
			this.pass(arguments[i]);
		}
		return;
	}
	
	var group = this;
	var index = group.args.length;
	group.args.length++;
	group.left++;
	if (this.firstSlotCallback) { // mcav
		this.firstSlotCallback();
		this.firstSlotCallback = null;
	}
	return function (err, data) {
		if (err) return group.error(err);
		group.args[index] = data;
		if (--group.left === 0) group.done();
	};
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

// Creates a nested group where several callbacks go into a single array.
Group.prototype.makeGroup = function makeGroup() {
	var group = this;
	var index = this.args.length++;
	//group.left++;
	return new Group(function (err) {
		if (err) return group.error(err);
		var data = slice.call(arguments, 1);
		group.args[index] = data;
		if (--group.left === 0) group.done();
	}, function () {
		group.left++;
	});
};

// Expose just for fun and extensibility
ff.Group = Group;

// Stepper function
function exec(steps, args, callback) {
	var pos = 0;
	next.apply(null, args);
	function next() {
		var step = steps[pos++];
		if (!step) {
			callback && callback.apply(null, arguments);
			return;
		}
		var group = new Group(next);
		try {
			// make sure next function isnt applied
			// until current function has completed
			group.left++;
			step.apply(group, arguments);
			group.left--;
		} catch (e) {
			group.left--;
			if (e === DONE_EXCEPTION) {
				return; // don't call anything else.
			}
			group.error(e); // try-catch added by mcav
		}
		if (group.left === 0) group.done();
	}
}

// Execute steps immediately
function ff() {
	exec(slice.call(arguments).map(autoHandleError), []);
	function autoHandleError(fn) {
		if (fn.includeError) { return fn; }
		return function (err) {
			if (err) { return this.error(err); }
			var args = slice.call(arguments, 1);
			fn.apply(this, args);
		};
	}
}


// Create a composite function with steps built-in
ff.fn = function () {
	var steps = slice.call(arguments);
	return function () {
		var args = slice.call(arguments);
		var callback = args.pop();
		exec(steps, args, callback);
	};
}

ff.cb = function (fn) {
	var wrapped = function () {
		fn.apply(this, arguments);
	};
	wrapped.includeError = true;
	return wrapped;
}

ff.error = function (fn) {
	var wrapped = function (err) {
		err && fn.apply(this, arguments);
	};
	wrapped.includeError = true;
	return wrapped;
}

ff.success = function (fn) {
	var wrapped = function (err) {
		!err && fn.apply(this, arguments);
	};
	wrapped.includeError = true;
	return wrapped;
}

