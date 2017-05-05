const findIndex = require('../utils/binarySearch')
const Node = require('../data/node')
const {findChildIndex} = require('../utils/findChildIndex')

/**
 * Modifies a bucket by removing a key/value from it.
 * Returns the passed bucket.
 */
function removeFromBucket(bucket, key) {
	const index = findIndex(bucket.keyCompareFn, key, bucket.keys)
	if (index >= 0) {
		bucket.keys.splice(index, 1)
		bucket.children.splice(index, 1)
	}
	bucket.store()
	return bucket
}

const BALANCE = {}, MERGE = {}

/**
 * Chooses a sibling, to balance across if possible, or to merge if balancing is not
 * possible.
 * Does not mutate anything.
 */
function selectChildAndSiblingForMerging(node, childIndex) {
	let result = {}
	if (childIndex > 0) {
		const leftSib = node.api.read(node.children[childIndex - 1])
		const rightSib = node.api.read(node.children[childIndex])
		const totalChildren = rightSib.children.length + leftSib.children.length
		const minAcrossBoth = rightSib.minChildren + leftSib.minChildren
		result = {
			action: totalChildren >= minAcrossBoth ? BALANCE : MERGE,
			index: childIndex - 1,
			left: leftSib,
			pivot: node.keys[childIndex - 1],
			right: rightSib
		}
	}
	if (!(result && result.action === BALANCE) && childIndex < (node.children.length - 1)) {
		const leftSib = node.api.read(node.children[childIndex])
		const rightSib = node.api.read(node.children[childIndex + 1])
		const totalChildren = leftSib.children.length + rightSib.children.length
		const minAcrossBoth = leftSib.minChildren + rightSib.minChildren
		result = {
			action: totalChildren >= minAcrossBoth ? BALANCE : MERGE,
			index: childIndex,
			left: leftSib,
			pivot: node.keys[childIndex],
			right: rightSib
		}
	}
	return result
}

function isUnderful(node) {
	return node.children.length < node.minChildren
}

/**
 * Removes a value from a (sub)tree making all the changes necessary to keep the tree
 * invariants.
 * Returns either the passed subtree root or, if there is only a single child that child.
 */
function removeFromNode(node, key) {
	let childIndex = findChildIndex(node, key);
	let child = node.api.read(node.children[childIndex])

	child = remove(child, key)
	node.children[childIndex] = child.ref

	if (isUnderful(child)) {
		const richSibling = selectChildAndSiblingForMerging(node, childIndex)
		if (richSibling.action === BALANCE) {
			const {index, left:leftSib, pivot:pivotBefore, right:rightSib} = richSibling
			const {pivot} = balance(leftSib, pivotBefore, rightSib)
			node.keys[index] = pivot
		} else if (richSibling.action === MERGE) {
			const {index, left:leftSib, pivot:pivotBefore, right:rightSib} = richSibling
			merge(leftSib, pivotBefore, rightSib)
			node.children.splice(index + 1, 1)
			node.keys.splice(index, 1)
		} else {
			throw new Error('i dont think this should happen')
		}
		node.store()
	}

	// I'm worried that this might be wrong.  Under what circumstances should
	// we unwrap a child?  Is it always when there is only one of them?
	if (!node.terminalNode && node.children.length === 1) {
		node.api.remove(node.ref)
		return node.api.read(node.children[0])
	}
	return node
}

function remove(node, key) {
	if (node instanceof Node === false) {
		throw new Error(`Node to remove from must be a node, was ${node}`)
	}
	if (node.terminalNode) {
		return removeFromBucket(node, key)
	} else {
		return removeFromNode(node, key)
	}
}

/**
 * merges two nodes together.  Afterward, all the
 * keys and children are in the node and sibling is no longer needed.
 */
function merge(node, splitPoint, sibling) {
	node.children = node.children.concat(sibling.children)
	if (node.terminalNode) {
		node.keys = node.keys.concat(sibling.keys)
		node.nextBucket = sibling.nextBucket

		const nextRef = sibling.nextBucket
		if (nextRef !== undefined) {
			const newNext = node.api.read(nextRef)
			newNext.prevBucket = node.ref
			newNext.store()
		}
	} else {
		node.keys = node.keys.concat(splitPoint, sibling.keys)
	}
	node.store()
	node.api.remove(sibling.ref)
}

/**
 * Tries to split the children across two nodes evenly.
 * Mutates both children.
 */
function balance(node, splitPoint, sibling) {
	const allChildren = node.children.slice().concat(sibling.children)
	let middle = Math.floor(allChildren.length / 2)
	let allKeys
	if (node.terminalNode) {
		allKeys = node.keys.slice().concat(sibling.keys)
		node.resetData(allKeys.slice(0, middle), allChildren.slice(0, middle), sibling.ref)
		sibling.resetData(allKeys.slice(middle), allChildren.slice(middle), sibling.nextBucket)
	} else {
		allKeys = node.keys.slice().concat(splitPoint, sibling.keys)
		middle = Math.floor(allKeys.length / 2)
		node.resetData(allKeys.slice(0, middle), allChildren.slice(0, middle + 1))
		sibling.resetData(allKeys.slice(middle + 1), allChildren.slice(middle + 1))
	}
	node.store()
	sibling.store()
	return {left: node, pivot: allKeys[middle], right: sibling}
}

module.exports = {
	remove, balance
}