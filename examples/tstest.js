// one of the questions is, should a .map or other such methods return a meta node that wraps the existing input and output, or just the output node.

// I think the answer is both.

// should a meta node always be coordinating the relations between nodes, or should they indepenently be able to handle things like backpressure

// maybe a coordinator/meta/array node should really only do 2 simple things:
// 1.) wire together the items using an otherwise public method called like .connect or .pipe
// 2.) represent the input and output of the first/last item, respectively

// parents should know about children because they push to children and listen to backlogged, paused, stopped, and competion events from them
// children should know about parents because they should wait for all of their parents to be completed before themselves beginning the completion process.


// Stop command should:
// 1.) start from a child and immediately stop any input/output
// 2.) propagate event up to parents, which should themselves stop when all of their children have stopped

// Complete command should:
// 1.) propagate upward to parents, but not stop any input/output on the way up
// 2.) when arriving at a parent with no parents, and a completion request from ALL children, pass completion event downward, which actually drains, then fires completed event and proceeds to next child

