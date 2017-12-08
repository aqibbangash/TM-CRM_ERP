/**
Copyright 2017 ToManage

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

@author    ToManage SAS <contact@tomanage.fr>
@copyright 2014-2017 ToManage SAS
@license   http://www.apache.org/licenses/LICENSE-2.0 Apache License, Version 2.0
International Registered Trademark & Property of ToManage SAS
*/



"use strict";

exports.id = 'order';
exports.version = 1.01;

var mongoose = require('mongoose'),
		_ = require('lodash'),
		async = require('async'),
		moment = require('moment'),
		fs = require('fs');

var Dict = INCLUDE('dict');
var Latex = INCLUDE('latex');

exports.install = function(options) {

		var object = new Object();

		Dict.extrafield({
				extrafieldName: 'Commande'
		}, function(err, doc) {
				if (err) {
						console.log(err);
						return;
				}

				object.fk_extrafields = doc;
		});

		F.route('/erp/api/order/lines/list', object.listLines, ['authorize']);
		F.route('/erp/api/order/dt_stockreturn', object.readDT_stockreturn, ['post', 'authorize']);
		F.route('/erp/api/order', object.getByViewType, ['authorize']);
		F.route('/erp/api/order/export', object.exportToType, ['authorize']);

		/**
     *@api {get} /order/ Request Orders
     *
     * @apiVersion 0.0.1
     * @apiName getOrders
     * @apiGroup Order
     *
     * @apiParam (?Field=value) {String} viewType="list" Type of View
     * @apiParam (?Field=value) {Number} page=1 Number of page
     * @apiParam (?Field=value) {Number} count=100 Count of Orders which will show
     * @apiParam (?Field=value) {String} contentType="order" Type of content
     *
     * @apiSuccess {Object} Orders
     * @apiSuccessExample Success-Response:
     HTTP/1.1 200 OK
     {
          total: 1014,
          count: 50,
          data: [
            {
              _id: "584abe3153bfade838152cea",
              salesPerson: {
                name: null
              },
              workflow: {
                _id: "55647b932e4aa3804a765ec5",
                name: "Draft/ Quotation",
                status: "New"
              },
              supplier: {
                _id: "57bacf6d4b2d7f3b4233d5c9",
                name: "Actifile "
              },
              currency: {
                rate: 1,
                _id: {
                  _id: "USD",
                  name: "USD",
                  decPlace: 2,
                  symbol: "$",
                  active: true
                }
              },
              paymentInfo: {
                taxes: 0,
                unTaxed: 30000,
                total: 30000
              },
              datec: "2016-12-23T00:00:00.000Z",
              name: "SO_2",
              status: {
                allocateStatus: "ALL",
                fulfillStatus: "ALL",
                shippingStatus: "NOT"
              },
              removable: false,
              channel: null,
              paymentsPaid: 0,
              total: 1014
            },
        ...
          ]
}
     */
		F.route('/erp/api/order', object.create, ['post', 'json', 'authorize'], 512);
		F.route('/erp/api/order/billing', object.createAllBills, ['post', 'json', 'authorize']);
		F.route('/erp/api/order/{orderId}', object.clone, ['post', 'json', 'authorize'], 512);
		F.route('/erp/api/order/{orderId}', object.show, ['authorize']);
		F.route('/erp/api/order/{orderId}', object.update, ['put', 'json', 'authorize'], 512);
		F.route('/erp/api/order', object.updateFieldsManyId, ['patch', 'json', 'authorize'], 512);
		F.route('/erp/api/order/{orderId}', object.destroy, ['delete', 'authorize']);
		F.route('/erp/api/order/{orderId}/{field}', object.updateField, ['put', 'json', 'authorize']);
		F.route('/erp/api/order/file/{Id}', object.createFile, ['post', 'authorize']);
		F.route('/erp/api/order/file/{Id}/{fileName}', object.getFile, ['authorize']);
		F.route('/erp/api/order/file/{Id}/{fileName}', object.deleteFile, ['delete', 'authorize']);
		F.route('/erp/api/order/pdf/{orderId}', object.generatePdf, ['put', 'authorize']);
		F.route('/erp/api/offer/pdf/{orderId}', object.generatePdf, ['put', 'authorize']);
		F.route('/erp/api/order/download/{:id}', object.download);

		//F.route('/erp/api/offer/pdf/{orderId}', object.pdf, ['authorize']);
};

function Object() {}

Object.prototype = {
		/*listLines: function() {
		    var self = this;
		    var OrderModel = MODEL('order').Schema;

		    OrderModel.findOne({
		        _id: self.query.id
		    }, "lines", function(err, doc) {
		        if (err)
		            return self.throw500(err);

		        self.json(doc.lines);
		    });
		},*/

		getByViewType: function() {
				var self = this;
				var Order;

				if (self.query.quotation === 'true') {
						if (self.query.forSales == "false")
								Order = MODEL('order').Schema.QuotationSupplier;
						else
								Order = MODEL('order').Schema.QuotationCustomer;
				} else {
						if (self.query.forSales == "false")
								Order = MODEL('order').Schema.OrderSupplier;
						else
								Order = MODEL('order').Schema.OrderCustomer;
				}

				var OrderStatus = MODEL('order').Status;

				var data = self.query;
				var paginationObject = MODULE('helper').page(self.query);
				var limit = paginationObject.limit;
				var skip = paginationObject.skip;

				Order.query({
						query: data,
						limit: limit,
						skip: skip,
						user: self.user
				}, function(err, result) {
						var count;
						var firstElement;
						var response = {};

						if (err)
								return self.throw500(err);

						//console.log(result.length);

						result = MODULE('utils').Status(result, OrderStatus);

						if (result.length)
								result[0].totalAll.Status = _.map(result[0].totalAll.Status, function(Status) {
										return _.extend(Status, MODULE('utils').Status(Status._id, OrderStatus));
								});

						firstElement = result[0];
						count = firstElement && firstElement.total ? firstElement.total : 0;
						response.total = count;
						response.totalAll = firstElement && firstElement.totalAll ? firstElement.totalAll : {
								count: 0,
								Status: [],
								total_ht: 0,
								total_ttc: 0,
								total_paid: 0
						};
						//response.total = result.length;
						response.data = result;

						//console.log(result);

						self.json(response);
				});
		},

		exportToType: function() {
				var self = this;
				var Order;

				if (self.query.quotation === 'true') {
						if (self.query.forSales == "false")
								Order = MODEL('order').Schema.QuotationSupplier;
						else
								Order = MODEL('order').Schema.QuotationCustomer;
				} else {
						if (self.query.forSales == "false")
								Order = MODEL('order').Schema.OrderSupplier;
						else
								Order = MODEL('order').Schema.OrderCustomer;
				}

				var type = self.query.type;

				const exportMap = MODULE('order').csv;

				var Stream = require('stream');
				var stream = new Stream();

				Order.query({
						query: self.query,
						user: self.user,
						exec: false
				}, function(err, resultQuery) {
						MODULE('exporter').exportToCsv({
								stream: stream,
								Model: Order,
								query: resultQuery,
								map: exportMap,
								fileName: type
						}, function(err, result) {
								if (err)
										console.log(err);

								stream.emit('end');
						});
				});

				self.res.setHeader('x-filename', 'export.csv');
				self.stream('application/text', stream, "export.csv");
		},

		/**
		 * Create an order
		 */
		create: function() {
				var self = this;
				if (self.query.quotation === 'true') {
						if (self.query.forSales == "false")
								var OrderModel = MODEL('order').Schema.QuotationSupplier;
						else
								var OrderModel = MODEL('order').Schema.QuotationCustomer;
				} else {
						if (self.query.forSales == "false")
								var OrderModel = MODEL('order').Schema.OrderSupplier;
						else
								var OrderModel = MODEL('order').Schema.OrderCustomer;
				}
				var order;

				if (self.query.forSales == "false")
						self.body.forSales = false;

				order = new OrderModel(self.body);

				order.createdBy = self.user._id;
				order.editedBy = self.user._id;

				if (!order.order)
						order.order = order._id;

				if (!order.entity)
						order.entity = self.user.entity;

				/*if (self.user.societe && self.user.societe.id) { // It's an external order
				    return ContactModel.findOne({
				        'societe.id': self.user.societe.id
				    }, function(err, contact) {
				        if (err)
				            console.log(err);

				        if (!contact)
				            contact = new ContactModel();

				        contact.entity = self.user.entity;
				        contact.firstname = self.user.firstname;
				        contact.lastname = self.user.lastname;
				        contact.email = self.user.email;


				        contact.societe.id = self.user.societe.id;
				        contact.societe.name = self.user.societe.name;

				        contact.name = contact.firstname + " " + contact.lastname;


				        //console.log(contact);
				        contact.save(function(err, doc) {
				            if (err)
				                console.log(err);

				            //console.log(doc);

				            order.contact.id = doc._id;
				            order.contact.name = doc.name;

				            order.supplier = self.user.societe.id;

				            order.save(function(err, doc) {
				                if (err)
				                    return console.log(err);

				                self.json(doc);
				            });
				        });
				    });
				}*/

				//console.log(order);

				async.waterfall([
								function(wCb) {
										var Model = MODEL('warehouse').Schema;
										//Load default warehouse
										if (order.warehouse)
												return wCb();

										Model.findOne({
												main: true
										}, "_id", function(err, warehouse) {
												if (err)
														return wCb(err);

												if (warehouse)
														order.warehouse = warehouse._id;

												wCb();
										});

								},
								function(wCb) {
										order.save(wCb);
								}
						],
						function(err, doc) {
								if (err)
										return self.throw500(err);

								self.json(doc);
						});
		},
		/**
		 * Clone an order
		 */
		clone: function(id) {
				var OrderRowsModel = MODEL('orderRows').Schema;
				var self = this;

				if (self.query.quotation === 'true') {
						if (self.query.forSales == "false")
								var OrderModel = MODEL('order').Schema.QuotationSupplier;
						else
								var OrderModel = MODEL('order').Schema.QuotationCustomer;
				} else {
						if (self.query.forSales == "false")
								var OrderModel = MODEL('order').Schema.OrderSupplier;
						else
								var OrderModel = MODEL('order').Schema.OrderCustomer;
				}

				var rows = self.body.lines;

				OrderModel.findById(id, function(err, doc) {
						var order = doc.toObject();
						delete order._id;
						delete order.__v;
						delete order.ref;
						delete order.createdAt;
						delete order.updatedAt;
						delete order.history;
						delete order.orderRows;
						delete order.offer;
						delete order.pdfModel;
						order.pdfs = [];
						order.total_paid = 0;
						order.status = {};
						order.Status = "DRAFT";
						order.notes = [];
						order.latex = {};
						order.datec = new Date();
						order.datedl = new Date();
						order.deliveries = []; // remove link to delivery
						order.bills = []; // remove link to bill

						order = new OrderModel(order);

						order.order = order._id;
						order.createdBy = self.user._id;
						order.editedBy = self.user._id;

						if (!order.entity)
								order.entity = self.user.entity;

						//console.log(order);

						order.save(function(err, order) {
								if (err)
										return console.log(err);

								async.each(rows, function(orderRow, aCb) {
												orderRow.order = order._id;

												if (orderRow.isDeleted && !orderRow._id)
														return aCb();

												delete orderRow._id;
												delete orderRow.__v;
												delete orderRow.createdAt;

												var orderRow = new OrderRowsModel(orderRow);
												orderRow.save(aCb);
										},
										function(err) {
												if (err) {
														console.log(err);
														return self.json({
																errorNotify: {
																		title: 'Erreur',
																		message: err
																}
														});
												}

												F.emit('order:recalculateStatus', {
														userId: self.user._id.toString(),
														order: {
																_id: order._id.toString()
														}
												});

												self.json(order);
										});
						});
				});
		},
		/**
		 * Update an order
		 */
		update: function(id) {
				var self = this;
				var OrderRowsModel = MODEL('orderRows').Schema;

				var DeliveryModel, OrderModel;
				const forSales = (self.query.forSales == 'false' ? false : true);

				if (self.query.quotation === 'true') {
						if (forSales == false)
								OrderModel = MODEL('order').Schema.QuotationSupplier;
						else
								OrderModel = MODEL('order').Schema.QuotationCustomer;
				} else {
						if (forSales == false) {
								OrderModel = MODEL('order').Schema.OrderSupplier;
								DeliveryModel = MODEL('order').Schema.GoodsInNote;
						} else {
								OrderModel = MODEL('order').Schema.OrderCustomer;
								DeliveryModel = MODEL('order').Schema.GoodsOutNote;
						}
				}

				var rows = [];

				//delete self.body.rows;

				self.body.editedBy = self.user._id;

				if (!self.body.createdBy)
						self.body.createdBy = self.user._id;

				//console.log(self.body.lines);
				//return;

				async.waterfall([
						function(wCb) {
								// Calcul numLine for pdf
								if (!self.body.lines || !self.body.lines.length)
										return wCb();

								let cpt = 1;
								async.forEachSeries(self.body.lines, function(elem, aCb) {

										if (elem.type == 'product' && !elem.isDeleted)
												elem.numLine = cpt++;

										return aCb();
								}, function(err) {
										return wCb(err, self.body.lines);
								});
						},
						function(lines, wCb) {
								var ProductModel = MODEL('product').Schema;
								//console.log(lines);

								//First refresh KIT
								rows = lines;

								if (self.body.Status != 'DRAFT')
										return wCb();

								lines = _.filter(lines, function(elem) {
										//Suppress old kit lines
										if (elem.type != 'kit')
												return true;

										OrderRowsModel.remove({
												_id: elem._id
										}, function(err, doc) {});
										return false;

								});

								var newLines = [];

								async.eachSeries(lines, function(line, eCb) {
										newLines.push(line);

										//console.log(line);

										if (!line.product || !line.product.info.productType.isBundle)
												return eCb();

										ProductModel.findById(line.product._id, "bundles info")
												.populate("bundles.id", "info directCost indirectCost taxes weight")
												.exec(function(err, product) {
														if (err)
																return eCb(err);

														async.each(product.bundles, function(elem, aCb) {
																/*
                                { _id: '59841dba3377071369cf4745',
  createdAt: '2017-08-04T07:09:46.788Z',
  updatedAt: '2017-08-04T07:14:17.115Z',
  product:'59841283c7445d7df772222c',
  description: 'Kit en test',
  sequence: 3,
  order: '59787c95f2ed40442b6a6110',
  warehouse: { _id: '5945a123907df220805d4df0', name: 'Main entrepot' },
  total_ht: 26284.13,
  discount: 0,
  costPrice: 0,
  pu_ht: 2190.344,
  priceSpecific: false,
  total_taxes:
   [ { value: 5256.826, taxeId: [Object] },
     { value: 2280, taxeId: [Object] } ],
  qty: 12,
  type: 'product',
  __v: 0,
  goodsNotes: [],
  fulfilled: 0,
  idLine: 3 }
*/
																let newLine = _.clone(line);
																newLine.type = 'kit';
																delete newLine._id;
																newLine.product = elem.id;
																newLine.description = "Quantite dans le kit : {0}".format(elem.qty);
																newLine.total_ht = 0;
																newLine.discount = 0;
																newLine.costPrice = elem.id.directCost;
																newLine.pu_ht = 0;
																newLine.priceSpecific = false;
																newLine.total_taxes = [];
																newLine.qty = line.qty * elem.qty;

																newLines.push(newLine);
																return aCb();
														}, eCb);
												});
								}, function(err) {
										if (err)
												return wCb(err);

										rows = newLines;
										wCb();
								});
						},
						function(wCb) {
								for (var i = 0; i < rows.length; i++)
										rows[i].sequence = i;

								wCb();
						},
						function(wCb) {
								MODULE('utils').sumTotal(rows, self.body.shipping, self.body.discount, self.body.supplier, wCb);
						},
						function(result, wCb) {
								//return console.log(result);
								self.body.total_ht = result.total_ht;
								self.body.total_taxes = result.total_taxes;
								self.body.total_ttc = result.total_ttc;
								self.body.weight = result.weight;

								//return console.log(self.body);

								OrderModel.findByIdAndUpdate(id, self.body, {
										new: true
								}, wCb);
						},
						function(order, wCb) {
								//order = _.extend(order, self.body);
								//console.log(order.history);
								//return console.log(rows);
								//update all rows
								var newRows = [];
								async.each(rows, function(orderRow, aCb) {
												orderRow.order = order._id;

												orderRow.warehouse = order.warehouse;

												if (orderRow.isDeleted && !orderRow._id)
														return aCb();

												if (orderRow._id)
														return OrderRowsModel.findByIdAndUpdate(orderRow._id, orderRow, {
																new: true
														}, function(err, doc) {
																if (err)
																		return aCb(err);
																newRows.push(doc);
																aCb();
														});

												var orderRow = new OrderRowsModel(orderRow);
												orderRow.save(function(err, doc) {
														if (err)
																return aCb(err);
														newRows.push(doc);
														aCb();
												});
										},
										function(err) {
												if (err)
														return wCb(err);
												wCb(null, order);
										});
						}
				], function(err, order) {
						if (err) {
								console.log(err);
								return OrderModel.update({
										_id: id
								}, {
										$set: {
												Status: 'DRAFT'
										}
								}, function(err, doc) {});
								return self.json({
										errorNotify: {
												title: 'Erreur',
												message: err
										}
								});
						}

						order.save(function(err, doc) {
								if (err) {
										console.log(err);
										return self.json({
												errorNotify: {
														title: 'Erreur',
														message: err
												}
										});
								}

								if (rows.length) {
										F.emit('order:recalculateStatus', {
												userId: self.user._id.toString(),
												order: {
														_id: doc._id.toString()
												}
										});

										F.emit('order:update', {
												userId: self.user._id.toString(),
												order: {
														_id: doc._id.toString()
												},
												route: self.query.quotation == 'true' ? 'offer' : 'order'
										}, OrderModel);
								}

								//console.log(doc);
								doc = doc.toObject();
								doc.successNotify = {
										title: "Success",
										message: "Commande enregistrée"
								};
								self.json(doc);
						});
				});
		},
		updateFieldsManyId: function() {
				const self = this;
				const body = self.body.body;
				var OrderRowsModel = MODEL('orderRows').Schema;

				var DeliveryModel, OrderModel;
				const forSales = (self.query.forSales == 'false' ? false : true);

				if (self.query.quotation === 'true') {
						if (forSales == false)
								OrderModel = MODEL('order').Schema.QuotationSupplier;
						else
								OrderModel = MODEL('order').Schema.QuotationCustomer;
				} else {
						if (forSales == false) {
								OrderModel = MODEL('order').Schema.OrderSupplier;
								DeliveryModel = MODEL('order').Schema.GoodsInNote;
						} else {
								OrderModel = MODEL('order').Schema.OrderCustomer;
								DeliveryModel = MODEL('order').Schema.GoodsOutNote;
						}
				}

				if (!self.body._id || !self.body._id.length)
						return self.throw500("No id");

				async.eachSeries(self.body._id, function(id, aCb) {
						async.waterfall([
								function(wCb) {
										OrderModel.findByIdAndUpdate(id, body, {
												new: true
										}, wCb);
								},
								function(order, wCb) {
										if (self.query.quotation === 'true')
												return wCb(null, order);

										// Send to logistic and create first delivery
										if (order.Status == "PROCESSING")
												setTimeout2('orderSendDelivery:' + order._id.toString(), function() {
														F.emit('order:sendDelivery', {
																userId: self.user._id.toString(),
																order: {
																		_id: order._id.toString()
																}
														});
												}, 1000);

										//Allocated product order
										if (order.Status == "VALIDATED" && order.forSales)
												return DeliveryModel.find({
														order: order._id,
														isremoved: {
																$ne: true
														}
												}, "_id", function(err, delivery) {
														if (err)
																return wCb(err);

														if (delivery && delivery.length) {
																// Do NOT Allocated if One delivery
																order.Status = "PROCESSING";
																return wCb(null, order);
														}

														return order.setAllocated(function(err) {
																if (err)
																		return wCb(err);

																//order.Status = "VALIDATED";
																wCb(null, order);
														});
												});

										if (order.Status == "DRAFT" && forSales)
												return order.unsetAllocated(function(err) {
														if (err)
																return wCb(err);

														wCb(null, order);
												});

										if (order.Status == "CANCELED" && forSales)
												return order.unsetAllocated(function(err) {
														if (err)
																return wCb(err);

														if (DeliveryModel)
																DeliveryModel.update({
																		order: order._id,
																		Status: 'DRAFT'
																}, {
																		$set: {
																				isremoved: true,
																				Status: 'CANCELED',
																				total_ht: 0,
																				total_ttc: 0,
																				total_tva: [],
																				orderRows: []
																		}
																}, {
																		multi: true,
																		upsert: false
																}, function(err) {
																		if (err)
																				console.log(err);
																});

														//Remove all Deliveries
														wCb(null, order);
												});

										return wCb(null, order);
								},
								function(doc, wCb) {

										F.emit('order:recalculateStatus', {
												userId: self.user._id.toString(),
												order: {
														_id: doc._id.toString()
												}
										});

										F.emit('order:update', {
												userId: self.user._id.toString(),
												order: {
														_id: doc._id.toString()
												},
												route: self.query.quotation == 'true' ? 'offer' : 'order'
										}, OrderModel);

										wCb();
								}
						], aCb);
				}, function(err) {
						if (err)
								return self.json({
										errorNotify: {
												title: 'Erreur',
												message: err
										}
								});

						var doc = {};
						doc.successNotify = {
								title: "Success",
								message: "Documents sauvegardes"
						};
						return self.json(doc);
				});


		},
		/**
		 * Delete an order
		 */
		destroy: function(id) {
				var self = this;

				if (self.query.quotation === 'true') {
						if (self.query.forSales == "false")
								var OrderModel = MODEL('order').Schema.QuotationSupplier;
						else
								var OrderModel = MODEL('order').Schema.QuotationCustomer;
				} else {
						if (self.query.forSales == "false")
								var OrderModel = MODEL('order').Schema.OrderSupplier;
						else
								var OrderModel = MODEL('order').Schema.OrderCustomer;
				}

				var OrderRowsModel = MODEL('orderRows').Schema;

				async.waterfall([
						function(wCb) {
								OrderModel.findById(id, wCb);
						},
						function(doc, wCb) {
								if (doc.forSales)
										return order.unsetAllocated(function(err) {
												if (err)
														return wCb(err);

												wCb(null, doc);
										});

								wCb(null, doc);
						},
						function(doc, wCb) {
								OrderModel.update({
										_id: id
								}, {
										$set: {
												isremoved: true,
												Status: 'CANCELED',
												total_ht: 0,
												total_ttc: 0,
												total_tva: []
										}
								}, wCb);
						},
						function(wCb) {
								OrderRowsModel.update({
										order: id
								}, {
										$set: {
												isDeleted: true
										}
								}, wCb);

						}
				], function(err) {
						if (err)
								return self.throw500(err);
						self.json({});
				});
		},

		readDT_stockreturn: function() {
				var self = this;

				var link = 'order';

				if (self.query.quotation === 'true') {
						var link = 'offer';
						if (self.query.forSales == "false")
								var OrderModel = MODEL('order').Schema.QuotationSupplier;
						else
								var OrderModel = MODEL('order').Schema.QuotationCustomer;
				} else {
						if (self.query.forSales == "false")
								var OrderModel = MODEL('order').Schema.OrderSupplier;
						else
								var OrderModel = MODEL('order').Schema.OrderCustomer;
				}

				var SocieteModel = MODEL('Customers').Schema;

				var query = JSON.parse(self.body.query);

				var conditions = {
						// Status: { $ne: "CLOSED" },
						isremoved: {
								$ne: true
						}
						//  forSales: true
				};

				//console.log(self.query);

				if (!query.search.value) {
						if (self.query.status_id && self.query.status_id !== 'null')
								conditions.Status = self.query.status_id;
				} else
						delete conditions.Status;

				if (!self.user.multiEntities)
						conditions.entity = self.user.entity;

				var options = {
						conditions: conditions,
						select: "supplier ref forSales status"
				};

				//console.log(options);

				async.parallel({
						status: function(cb) {
								/*Dict.dict({
								    dictName: "fk_order_status",
								    object: true
								}, cb);*/
								cb(null, MODEL('order').Status);
						},
						datatable: function(cb) {
								OrderModel.dataTable(query, options, cb);
						}
				}, function(err, res) {
						if (err)
								console.log(err);

						SocieteModel.populate(res, {
								path: "datatable.data.supplier"
						}, function(err, res) {

								for (var i = 0, len = res.datatable.data.length; i < len; i++) {
										var row = res.datatable.data[i];


										// Add id
										res.datatable.data[i].DT_RowId = row._id.toString();

										if (row.supplier && row.supplier._id)
												res.datatable.data[i].supplier = '<a class="with-tooltip" href="#!/societe/' + row.supplier._id + '" data-tooltip-options=\'{"position":"top"}\' title="' + row.supplier.fullName + '"><span class="fa fa-institution"></span> ' + row.supplier.fullName + '</a>';
										else {
												if (!row.supplier)
														res.datatable.data[i].supplier = {};
												res.datatable.data[i].supplier = '<span class="with-tooltip editable editable-empty" data-tooltip-options=\'{"position":"top"}\' title="Empty"><span class="fa fa-institution"></span> Empty</span>';
										}

										// Add url on name
										if (row.forSales)
												res.datatable.data[i].ID = '<a class="with-tooltip" href="#!/' + link + '/' + row._id + '" data-tooltip-options=\'{"position":"top"}\' title="' + row.ref + '"><span class="fa fa-shopping-cart"></span> ' + row.ref + '</a>';
										else
												res.datatable.data[i].ID = '<a class="with-tooltip" href="#!/' + link + 'supplier/' + row._id + '" data-tooltip-options=\'{"position":"top"}\' title="' + row.ref + '"><span class="fa fa-shopping-cart"></span> ' + row.ref + '</a>';
										// Convert Date
										res.datatable.data[i].datec = (row.datec ? moment(row.datec).format(CONFIG('dateformatShort')) : '');
										res.datatable.data[i].datedl = (row.datedl ? moment(row.datedl).format(CONFIG('dateformatShort')) : '');

										// Convert Status
										res.datatable.data[i].Status = (res.status.values[row.Status] ? '<span class="label label-sm ' + res.status.values[row.Status].cssClass + '">' + i18n.t(res.status.lang + ":" + res.status.values[row.Status].label) + '</span>' : row.Status);
										if (row.status && link == 'order') {
												res.datatable.data[i].Status += '<span class="pull-right">';
												res.datatable.data[i].Status += '<span class="fa large fa-check-circle ' + (row.status.allocateStatus == 'NOR' ? 'font-grey' : '') + (row.status.allocateStatus == 'ALL' ? 'font-green-jungle' : '') + (row.status.allocateStatus == 'NOA' ? 'font-yellow-lemon' : '') + (row.status.allocateStatus == 'NOT' ? 'font-red' : '') + '"></span>';
												res.datatable.data[i].Status += '<span class="fa large fa-inbox ' + (row.status.fulfillStatus == 'NOR' ? 'font-grey' : '') + (row.status.fulfillStatus == 'ALL' ? 'font-green-jungle' : '') + (row.status.fulfillStatus == 'NOA' ? 'font-yellow-lemon' : '') + (row.status.fulfillStatus == 'NOT' ? 'font-red' : '') + '"></span>';
												res.datatable.data[i].Status += '<span class="fa large fa-truck ' + (row.status.shippingStatus == 'NOR' ? 'font-grey' : '') + (row.status.shippingStatus == 'ALL' ? 'font-green-jungle' : '') + (row.status.shippingStatus == 'NOA' ? 'font-yellow-lemon' : '') + (row.status.shippingStatus == 'NOT' ? 'font-red' : '') + '"></span>';
												res.datatable.data[i].Status += '</span>';
										}
								}

								//console.log(res.datatable);

								self.json(res.datatable);
						});
				});
		},
		/**
		 * Show an order
		 */
		show: function(id) {
				var self = this;

				var objectId = MODULE('utils').ObjectId;

				var Prepayments = MODEL('payment').Schema.prepayment;
				var OrderRows = MODEL('orderRows').Schema;
				var Invoice = MODEL('invoice').Schema;
				var departmentSearcher;
				var contentIdsSearcher;
				var orderRowsSearcher;
				var contentSearcher;
				var prepaymentsSearcher;
				var invoiceSearcher;
				var stockReturnsSearcher;
				var waterfallTasks;

				if (id.length < 24)
						return self.throw400();

				if (self.query.quotation === 'true') {
						if (self.query.forSales == "false")
								var OrderModel = MODEL('order').Schema.QuotationSupplier;
						else
								var OrderModel = MODEL('order').Schema.QuotationCustomer;
				} else {
						if (self.query.forSales == "false")
								var OrderModel = MODEL('order').Schema.OrderSupplier;
						else
								var OrderModel = MODEL('order').Schema.OrderCustomer;
				}


				const DeliveryModel = MODEL('order').Schema.Order;
				const BillModel = MODEL('invoice').Schema;
				const ObjectId = MODULE('utils').ObjectId;

				/*departmentSearcher = function(waterfallCallback) {
				    MODEL('Department').Schema.aggregate({
				            $match: {
				                users: objectId(self.user._id)
				            }
				        }, {
				            $project: {
				                _id: 1
				            }
				        },

				        waterfallCallback);
				};

				contentIdsSearcher = function(deps, waterfallCallback) {
				    var everyOne = rewriteAccess.everyOne();
				    var owner = rewriteAccess.owner(req.session.uId);
				    var group = rewriteAccess.group(req.session.uId, deps);
				    var whoCanRw = [everyOne, owner, group];
				    var matchQuery = {
				        $or: whoCanRw
				    };

				    var Model = models.get(req.session.lastDb, 'Order', OrderSchema);

				    Model.aggregate({
				        $match: matchQuery
				    }, {
				        $project: {
				            _id: 1
				        }
				    }, waterfallCallback);
				};

				contentSearcher = function(quotationsIds, waterfallCallback) {
				    var query;

				    query = OrderModel.findById(id);

				    query
				        .populate('supplier', '_id name fullName address')
				        .populate('destination')
				        .populate('currency._id')
				        .populate('incoterm')
				        .populate('priceList', 'name')
				        .populate('costList', 'name')
				        .populate('warehouse', 'name')
				        .populate('salesPerson', 'name')
				        .populate('invoiceControl')
				        .populate('paymentTerm')
				        .populate('paymentMethod', '_id name account bank address swiftCode owner')
				        .populate('editedBy.user', '_id login')
				        .populate('deliverTo', '_id, name')
				        .populate('project', '_id name')
				        .populate('shippingMethod', '_id name')
				        .populate('workflow', '_id name status');

				    query.exec(waterfallCallback);
				};

				orderRowsSearcher = function(order, waterfallCallback) {

				    OrderRows.find({ order: order._id })
				        .populate('product', 'cost name sku info')
				        .populate('debitAccount', 'name')
				        .populate('creditAccount', 'name')
				        .populate('taxes.taxCode', 'fullName rate')
				        .populate('warehouse', 'name')
				        .sort('sequence')
				        .exec(function(err, docs) {
				            if (err)
				                return waterfallCallback(err);

				            //order = order.toJSON();

				            OrderRows.getAvailableForRows(docs, order.forSales, function(err, docs, goodsNotes) {
				                if (err)
				                    return waterfallCallback(err);

				                order.products = docs;
				                order.account = docs && docs.length ? docs[0].debitAccount : {};

				                if (!order.forSales)
				                    order.account = docs && docs.length ? docs[0].creditAccount : {};


				                order.goodsNotes = goodsNotes;

				                waterfallCallback(null, order);
				            });

				        });
				};

				prepaymentsSearcher = function(order, waterfallCallback) {
				    Prepayments.aggregate([{
				        $match: {
				            order: objectId(id)
				        }
				    }, {
				        $project: {
				            paidAmount: 1,
				            currency: 1,
				            date: 1,
				            name: 1,
				            refund: 1
				        }
				    }, {
				        $project: {
				            paidAmount: { $divide: ['$paidAmount', '$currency.rate'] },
				            date: 1,
				            name: 1,
				            refund: 1
				        }
				    }, {
				        $project: {
				            paidAmount: { $cond: [{ $eq: ['$refund', true] }, { $multiply: ['$paidAmount', -1] }, '$paidAmount'] },
				            date: 1,
				            name: 1,
				            refund: 1
				        }
				    }, {
				        $group: {
				            _id: null,
				            sum: { $sum: '$paidAmount' },
				            names: { $push: '$name' },
				            date: { $min: '$date' }
				        }
				    }], function(err, result) {
				        if (err)
				            return waterfallCallback(err);

				        order.prepayment = result && result.length ? result[0] : {};

				        waterfallCallback(null, order);
				    });
				};

				invoiceSearcher = function(order, waterfallCallback) {
				    Invoice.aggregate([{
				        $match: {
				            sourceDocument: objectId(id)
				        }
				    }, {
				        $project: {
				            name: 1
				        }
				    }], function(err, result) {
				        if (err)
				            return waterfallCallback(err);

				        order.invoice = result && result.length ? result[0] : {};
				        waterfallCallback(null, order);
				    });
				};

				stockReturnsSearcher = function(order, waterfallCallback) {
				    var StockReturnsModel = MODEL('order').Schema.stockReturns;

				    StockReturnsModel.aggregate([{
				        $match: { order: objectId(order._id) }
				    }, {
				        $unwind: {
				            path: '$journalEntrySources',
				            preserveNullAndEmptyArrays: true
				        }
				    }, {
				        $group: {
				            _id: null,
				            date: { $max: '$releaseDate' },
				            names: { $addToSet: '$name' },
				            journalEntrySources: { $addToSet: '$journalEntrySources' }
				        }
				    }], function(err, docs) {
				        if (err)
				            return waterfallCallback(err);


				        docs = docs && docs.length ? result[0] : {};

				        order.stockReturns = (docs || []);

				        waterfallCallback(null, order);
				    });
				};

				waterfallTasks = [departmentSearcher, /*contentIdsSearcher,*/
				/*contentSearcher, orderRowsSearcher, prepaymentsSearcher, invoiceSearcher, stockReturnsSearcher];

				       async.waterfall(waterfallTasks, function(err, result) {
				           //console.log(result);

				           if (err)
				               return self.throw500(err);

				           //getHistory(req, result, function(err, order) {
				           //    if (err)
				           //        return self.throw500(err);

				           //self.json(result);
				           //});
				       });*/

				async.parallel({
								order: function(pCb) {
										OrderModel.getById(id, pCb);
								},
								deliveries: function(pCb) {
										DeliveryModel.find({
												order: id,
												isremoved: {
														$ne: true
												},
												_type: {
														$in: ['GoodsOutNote', 'GoodsInNote', 'stockReturns']
												}
										}, "_id ref Status forSales", pCb);
										/*DeliveryModel.aggregate([{
										    $match: { _id: ObjectId(id) }
										}, {
										    $project: {
										        _id: 1,
										        ref: 1,
										        lines: 1
										    }
										}, {
										    $unwind: '$lines'
										}, {
										    $group: {
										        _id: "$lines.product",
										        orderQty: { $sum: "$lines.qty" },
										        order: { $first: "$_id" },
										        refProductSupplier: { $addToSet: "$lines.refProductSupplier" },
										        description: { $first: "$lines.description" }
										    }
										}, {
										    $lookup: {
										        from: 'Delivery',
										        localField: 'order',
										        foreignField: 'order',
										        as: 'deliveries'
										    }
										}, {
										    $project: {
										        _id: 1,
										        orderQty: 1,
										        order: 1,
										        "deliveries": {
										            "$filter": {
										                "input": "$deliveries",
										                "as": "delivery",
										                "cond": { "$ne": ["$$delivery.isremoved", true] }
										            }
										        },
										        refProductSupplier: 1,
										        description: 1
										    }
										}, {
										    $unwind: {
										        path: '$deliveries',
										        preserveNullAndEmptyArrays: true
										    }
										}, {
										    $project: {
										        _id: 1,
										        orderQty: 1,
										        order: 1,
										        'deliveries.ref': 1,
										        'deliveries._id': 1,
										        'deliveries.datedl': 1,
										        'deliveries.lines': {
										            $filter: {
										                input: "$deliveries.lines",
										                as: "line",
										                cond: { $eq: ["$$line.product", "$_id"] }
										            }
										        },
										        refProductSupplier: 1,
										        description: 1
										    }
										}, {
										    $unwind: {
										        path: '$deliveries.lines',
										        preserveNullAndEmptyArrays: true
										    }
										}, {
										    $group: {
										        _id: "$_id",
										        orderQty: { $first: "$orderQty" },
										        deliveryQty: { $sum: "$deliveries.lines.qty" },
										        deliveries: { $addToSet: { _id: "$deliveries._id", ref: "$deliveries.ref", qty: "$deliveries.lines.qty", datedl: "$deliveries.datedl" } },
										        refProductSupplier: { $first: "$refProductSupplier" },
										        description: { $first: "$description" }
										    }
										}, {
										    $lookup: {
										        from: 'Product',
										        localField: '_id',
										        foreignField: '_id',
										        as: 'product'
										    }
										}, {
										    $unwind: '$product'
										}, {
										    $project: {
										        _id: 1,
										        deliveryQty: 1,
										        orderQty: 1,
										        deliveries: 1,
										        'product._id': 1,
										        'product.info.SKU': 1,
										        'product.weight': 1,
										        refProductSupplier: 1,
										        description: 1
										    }
										}, {
										    $sort: {
										        'product.info.SKU': 1
										    }
										}], pCb);*/
								},
								invoices: function(pCb) {
										BillModel.find({
												orders: id,
												isremoved: {
														$ne: true
												}
										}, "_id ref Status total_ht forSales", pCb);
								}
						},
						function(err, result) {
								if (err)
										return self.throw500(err);

								if (!result.order)
										return self.throw404();

								//result.order = result.order.toObject();
								result.order.deliveries = result.deliveries;
								result.order.invoices = result.invoices;

								//console.log(result.order);

								self.json(result.order);
						});
		},
		/**
		 * Add a file in an order
		 */
		createFile: function(req, res) {
				var id = req.params.Id;
				//console.log(id);
				//console.log(req.body);

				if (req.files && id) {
						console.log("Add : " + req.files.file.originalFilename);

						/* Add dossier information in filename */
						if (req.body.idx)
								req.files.file.originalFilename = req.body.idx + "_" + req.files.file.originalFilename;

						gridfs.addFile(CommandeModel, id, req.files.file, function(err, result) {
								//console.log(result);
								if (err)
										res.send(500, err);
								else
										res.send(200, result);
						});
				} else
						res.send(500, "Error in request file");
		},
		/**
		 * Get a file form an order
		 */
		getFile: function(req, res) {
				var id = req.params.Id;
				if (id && req.params.fileName) {

						gridfs.getFile(CommandeModel, id, req.params.fileName, function(err, store) {
								if (err)
										return res.send(500, err);
								if (req.query.download)
										res.attachment(store.filename); // for downloading

								res.type(store.contentType);
								store.stream(true).pipe(res);
						});
				} else {
						res.send(500, "Error in request file");
				}

		},
		/**
		 * Delete a file in an order
		 */
		deleteFile: function(req, res) {
				//console.log(req.body);
				var id = req.params.Id;
				//console.log(id);

				if (req.params.fileName && id) {
						gridfs.delFile(CommandeModel, id, req.params.fileName, function(err, result) {
								//console.log(result);
								if (err)
										res.send(500, err);
								else
										res.send(200, result);
						});
				} else
						res.send(500, "File not found");
		},
		pdf: function(ref, self) {
				// Generation de la facture PDF et download
				var SocieteModel = MODEL('Customers').Schema;
				var BankModel = MODEL('bank').Schema;
				var OrderModel = MODEL('order').Schema.Order;

				if (!self)
						self = this;

				var discount = false;
				var cond_reglement_code = {};
				Dict.dict({
						dictName: "fk_payment_term",
						object: true
				}, function(err, docs) {
						cond_reglement_code = docs;
				});
				var mode_reglement_code = {};
				Dict.dict({
						dictName: "fk_paiement",
						object: true
				}, function(err, docs) {
						mode_reglement_code = docs;
				});



				OrderModel.getById(ref, function(err, doc) {

						var title = "";

						var model = 'order'; //Latex model

						if (self.query.proforma)
								title = "Facture pro forma";
						else
								switch (doc._type) {
										case 'orderCustomer':
												title = 'Commande';
												model = "order";
												break;
										case 'orderSupplier':
												title = 'Commande fournisseur';
												model = "order_supplier";
												break;
										case 'quotationCustomer':
												title = 'Devis';
												model = "offer";
												break;
										case 'quotationSupplier':
												title = 'Demande d\'achat';
												model = "offer_supplier";
												break;
								}

						// check if discount
						for (var i = 0; i < doc.lines.length; i++) {
								if (doc.lines[i].discount > 0) {
										model += "_discount";
										discount = true;
										break;
								}
						}

						SocieteModel.findOne({
								_id: doc.supplier._id
						}, function(err, societe) {
								BankModel.findOne({
										_id: doc.bank_reglement
								}, function(err, bank) {
										if (bank)
												var iban = bank.name_bank + "\n RIB : " + bank.code_bank + " " + bank.code_counter + " " + bank.account_number + " " + bank.rib + "\n IBAN : " + bank.iban + "\n BIC : " + bank.bic;

										// Array of lines
										var tabLines = [];

										if (discount)
												tabLines.push({
														keys: [{
																key: "ref",
																type: "string"
														}, {
																key: "description",
																type: "area"
														}, {
																key: "qty",
																type: "number",
																precision: 3
														}, {
																key: "pu_ht",
																type: "number",
																precision: 3
														}, {
																key: "discount",
																type: "string"
														}, {
																key: "total_ht",
																type: "euro"
														}, {
																key: "tva_tx",
																type: "string"
														}]
												});
										else
												tabLines.push({
														keys: [{
																key: "ref",
																type: "string"
														}, {
																key: "description",
																type: "area"
														}, {
																key: "qty",
																type: "number",
																precision: 0
														}, {
																key: "pu_ht",
																type: "number",
																precision: 3
														}, {
																key: "total_ht",
																type: "euro"
														}, {
																key: "tva_tx",
																type: "string"
														}]
												});

										for (var i = 0; i < doc.lines.length; i++) {
												switch (doc.lines[i].type) {
														case 'SUBTOTAL':
																tabLines.push({
																		ref: "",
																		description: "\\textbf{Sous-total}",
																		tva_tx: null,
																		pu_ht: "",
																		discount: "",
																		qty: "",
																		total_ht: doc.lines[i].total_ht
																});
																break;
														case 'COMMENT':
																tabLines.push({
																		ref: "",
																		description: /*"\\textbf{" + doc.lines[i].refProductSupplier + "}" + */ (doc.lines[i].description ? "\\\\" + doc.lines[i].description : ""),
																		tva_tx: null,
																		pu_ht: "",
																		discount: "",
																		qty: "",
																		total_ht: ""
																});
																break;
														default:
																tabLines.push({
																		ref: doc.lines[i].product.info.SKU.substring(0, 12),
																		description: "\\textbf{" + doc.lines[i].product.info.langs[0].name + "}" + (doc.lines[i].description ? "\\\\" + doc.lines[i].description : "") + (doc.lines[i].total_taxes.length > 1 ? "\\\\\\textit{" + doc.lines[i].total_taxes[1].taxeId.langs[0].name + " : " + doc.lines[i].product.taxes[1].value + " \\euro}" : ""),
																		tva_tx: (doc.lines[i].total_taxes.length ? doc.lines[i].total_taxes[0].taxeId.rate : 0),
																		pu_ht: doc.lines[i].pu_ht,
																		discount: (doc.lines[i].discount ? (doc.lines[i].discount + " %") : ""),
																		qty: {
																				value: doc.lines[i].qty,
																				unit: (doc.lines[i].product.unit ? " " + doc.lines[i].product.unit : "U")
																		},
																		total_ht: doc.lines[i].total_ht
																});

																/*if (doc.lines[i].total_taxes.length > 1) // Add ecotaxe
																    tabLines.push({
																    italic: true,
																    ref: "",
																    description: "\\textit{" + doc.lines[i].total_taxes[1].taxeId.langs[0].name + " : " + doc.lines[i].total_taxes[1].value + " \\euro}",
																    //tva_tx: doc.lines[i].total_taxes[0].taxeId.rate,
																    tva_tx: "",
																    //pu_ht: doc.lines[i].product.taxes[1].value,
																    pu_ht: "",
																    discount: "",
																    qty: "",
																    //qty: { value: doc.lines[i].qty, unit: (doc.lines[i].product.unit ? " " + doc.lines[i].product.unit : "U") },
																    //total_ht: doc.lines[i].total_taxes[1].value
																    total_ht: ""
																});*/
												}

												if (doc.lines[i].type == 'kit') {
														tabLines[tabLines.length - 1].italic = true;
														if (doc.lines[i + 1] && doc.lines[i + 1].type != 'kit')
																tabLines.push({
																		hline: 1
																});
												}

												if (doc.lines[i].type == 'SUBTOTAL') {
														tabLines[tabLines.length - 1].italic = true;
														tabLines.push({
																hline: 1
														});
												}

												//tab_latex += " & \\specialcell[t]{\\\\" + "\\\\} & " +   + " & " + " & " +  "\\tabularnewline\n";
										}

										// Array of totals
										var tabTotal = [{
												keys: [{
														key: "label",
														type: "string"
												}, {
														key: "total",
														type: "euro"
												}]
										}];

										// Frais de port
										if (doc.shipping && doc.shipping.total_ht)
												tabTotal.push({
														label: "Frais de port",
														total: doc.shipping.total_ht
												});

										// Remise globale
										if (doc.discount && doc.discount.discount && doc.discount.discount.percent)
												tabTotal.push({
														italic: true,
														label: "Remise globale " + doc.discount.discount.percent + ' %',
														total: doc.discount.discount.value * -1
												});

										// Escompte
										if (doc.discount && doc.discount.escompte && doc.discount.escompte.percent)
												tabTotal.push({
														italic: true,
														label: "Escompte " + doc.discount.escompte.percent + ' %',
														total: doc.discount.escompte.value * -1
												});


										//Total HT
										tabTotal.push({
												label: "Total HT",
												total: doc.total_ht
										});

										for (var i = 0; i < doc.total_taxes.length; i++) {
												tabTotal.push({
														label: "Total " + doc.total_taxes[i].taxeId.langs[0].label,
														total: doc.total_taxes[i].value
												});
										}

										//Total TTC
										tabTotal.push({
												label: "Total TTC",
												total: doc.total_ttc
										});

										var reglement = "";
										switch (doc.mode_reglement_code) {
												case "VIR":
														if (doc.bank_reglement) // Bank specific for payment
																reglement = "\n" + (bank.invoice ? bank.invoice : bank.iban.id);
														else // Default IBAN
																reglement = "\n --IBAN--";
														break;
												case "CHQ":
														if (doc.bank_reglement) // Bank specific for payment
																reglement = "\n" + (bank.invoice ? bank.invoice : "");
														else
																reglement = "A l'ordre de --ENTITY--";
														break;
										}

										//Periode de facturation
										var period = "";
										if (doc.dateOf && doc.dateTo)
												period = "\\textit{P\\'eriode du " + moment(doc.dateOf).format(CONFIG('dateformatShort')) + " au " + moment(doc.dateTo).format(CONFIG('dateformatShort')) + "}\\\\";


										self.res.setHeader('Content-type', 'application/pdf');
										Latex.Template(model + ".tex", doc.entity)
												.apply({
														"NUM": {
																"type": "string",
																"value": doc.ref
														},
														"DESTINATAIRE.NAME": {
																"type": "string",
																"value": doc.supplier.fullName
														},
														"DESTINATAIRE.ADDRESS": {
																"type": "area",
																"value": doc.address.street
														},
														"DESTINATAIRE.ZIP": {
																"type": "string",
																"value": doc.address.zip
														},
														"DESTINATAIRE.TOWN": {
																"type": "string",
																"value": doc.address.city
														},
														"DESTINATAIRE.TVA": {
																"type": "string",
																"value": societe.companyInfo.idprof6
														},
														"SHIPPING.NAME": {
																"type": "string",
																"value": doc.shippingAddress.name
														},
														"SHIPPING.ADDRESS": {
																"type": "area",
																"value": doc.shippingAddress.street
														},
														"SHIPPING.ZIP": {
																"type": "string",
																"value": doc.shippingAddress.zip
														},
														"SHIPPING.TOWN": {
																"type": "string",
																"value": doc.shippingAddress.city
														},
														"CODECLIENT": {
																"type": "string",
																"value": societe.salesPurchases.ref
														},
														"TITLE": {
																"type": "string",
																"value": title
														},
														"REFCLIENT": {
																"type": "string",
																"value": doc.ref_client
														},
														"DELIVERYMODE": {
																"type": "string",
																"value": doc.delivery_mode
														},
														"PERIOD": {
																"type": "string",
																"value": period
														},
														"DATEC": {
																"type": "date",
																"value": doc.datec,
																"format": CONFIG('dateformatShort')
														},
														"DATEEXP": {
																"type": "date",
																"value": doc.datedl,
																"format": CONFIG('dateformatShort')
														},
														"REGLEMENT": {
																"type": "string",
																"value": cond_reglement_code.values[doc.cond_reglement_code].label
														},
														"PAID": {
																"type": "string",
																"value": mode_reglement_code.values[doc.mode_reglement_code].label
														},
														"NOTES": {
																"type": "area",
																"value": (doc.notes.length ? doc.notes[0].note : ""),
														},
														"BK": {
																"type": "area",
																"value": reglement
														},
														"TABULAR": tabLines,
														"TOTAL": tabTotal,
														"APAYER": {
																"type": "euro",
																"value": doc.total_ttc || 0
														}
												})
												.on('error', function(err) {
														console.log(err);
														self.res.send(500, err);
												})
												.finalize(function(tex) {
														//console.log('The document was converted.');
												})
												.compile()
												.pipe(self.res)
												.on('close', function() {
														console.log('document written');
												});
								});
						});
				});
		},
		generatePdf: function(id) {
				// Generation de la facture PDF et download
				const OrderModel = MODEL('order').Schema.Order;
				const self = this;

				OrderModel.generatePdfById(id, self.query.model, function(err, doc) {
						if (err)
								return self.json({
										errorNotify: {
												title: 'Erreur',
												message: err
										}
								});

						return self.json({});
				});
		},
		download: function(id) {
				var self = this;
				var OrderModel = MODEL('order').Schema;

				var object = new Object();

				OrderModel.findOne({
						_id: id
				}, function(err, order) {
						if (err)
								return self.throw500(err);

						if (!order)
								return self.view404('Order id not found');

						//var date = new Date();
						//order.updatedAt.setDate(order.updatedAt.getDate() + 15); // date + 15j, seulement telechargement pdt 15j

						//if (order.updatedAt < date)
						//    return self.view404('Order expired');

						object.pdf(id, self);

						order.history.push({
								date: new Date(),
								mode: 'email',
								msg: 'email pdf telecharge',
								Status: 'notify'
						});

						order.save();

				});
		},
		createAllBills: function() {
				var self = this;
				var OrderModel = MODEL('order').Schema.OrderCustomer;
				var FactureModel = MODEL('invoice').Schema;
				var SocieteModel = MODEL('Customers').Schema;
				//console.log(req.body.dateEnd);

				if (!this.body.id)
						return self.throw500("No ids in destroy list");

				//var list = JSON.parse(this.query.id);
				var list = this.body.id;
				if (!list)
						return self.throw500("No ids in destroy list");

				//console.log(list);

				list = _.map(list, function(id) {
						return mongoose.Types.ObjectId(id);
				});

				OrderModel.aggregate([{
										"$match": {
												Status: "PROCESSING",
												_id: {
														$in: list
												}
										}
								},
								{
										"$project": {
												_id: 1,
												datec: 1,
												cond_reglement_code: 1,
												mode_reglement_code: 1,
												datedl: 1,
												delivery_mode: 1,
												entity: 1,
												"ref": 1,
												discount: 1,
												salesPerson: 1,
												shipping: 1,
												total_paid: 1,
												"supplier": 1
										}
								}, {
										$lookup: {
												from: 'Customers',
												localField: 'supplier',
												foreignField: '_id',
												as: 'supplier'
										}
								}, {
										$unwind: "$supplier"
								},
								{
										"$project": {
												_id: 1,
												datec: 1,
												cond_reglement_code: 1,
												mode_reglement_code: 1,
												datedl: 1,
												delivery_mode: 1,
												entity: 1,
												ref: 1,
												discount: 1,
												shipping: 1,
												salesPerson: 1,
												ref: 1,
												"supplier": {
														$cond: {
																if: "$supplier.salesPurchases.cptBilling",
																then: "$supplier.salesPurchases.cptBilling",
																else: "$supplier._id"
														}
												}
										}
								},
								{
										$lookup: {
												from: 'orderRows',
												localField: '_id',
												foreignField: 'order',
												as: 'lines'
										}
								},
								/*{
								    $unwind: "$lines"
								},*/
								{
										"$sort": {
												datedl: 1
										}
								},
								{
										"$group": {
												"_id": {
														supplier: "$supplier",
														entity: "$entity"
												},
												"data": {
														"$push": "$$ROOT"
												}
										}
								}
						],
						function(err, docs) {
								if (err)
										return console.log(err);

								// Creation des factures
								async.each(docs, function(client, callback) {

										SocieteModel.findOne({
												_id: client._id.supplier
										}, function(err, societe) {

												var id = client.data[0]._id;


												if (societe == null)
														console.log("Error : pas de societe pour le clientId : " + client._id);

												var facture = _.clone(client.data[0]);
												delete facture._id;
												delete facture.Status;
												delete facture.latex;
												delete facture.datec;

												if (moment(facture.datedl).isAfter(moment()))
														facture.datec = facture.datedl;

												delete facture.datedl;
												delete facture.createdAt;
												delete facture.updatedAt;
												delete facture.ref;
												delete facture.history;
												delete facture.pdfModel;
												facture.pdfs = [];
												facture.address = societe.address;
												facture.supplier = societe._id;
												facture.type = 'INVOICE_AUTO';
												facture.orders = [];
												facture.shipping.total_ht = 0;

												facture.lines = [];

												facture = new FactureModel(facture);

												var orderId = [];

												//return console.log(facture);

												for (var i = 0, len = client.data.length; i < len; i++) {
														//console.log(client.data[i]);

														if (client.data[i].lines)
																for (var j = 0; j < client.data[i].lines.length; j++) {
																		var aline = client.data[i].lines[j];
																		aline.description += (aline.description ? "\n" : "") + client.data[i].ref + " (" + moment(client.data[i].datedl).format(CONFIG('dateformatShort')) + ")";
																		if (aline.qty) //Suppress qty 0
																				facture.lines.push(aline);
																}

														facture.shipping.total_ht += client.data[i].shipping.total_ht;
														//facture.shipping.total_tva += client.data[i].shipping.total_tva;

														orderId.push(client.data[i]._id.toString());

												}

												facture.orders = _.uniq(orderId, true);

												MODULE('utils').sumTotal(facture.lines, facture.shipping, facture.discount, facture.supplier, function(err, result) {
														if (err) {
																console.log(err);
																return self.json({
																		errorNotify: {
																				title: 'Erreur',
																				message: err
																		}
																});
														}

														facture.total_ht = result.total_ht;
														facture.total_taxes = result.total_taxes;
														facture.total_ttc = result.total_ttc;
														facture.weight = result.weight;

														//facture.lines = rows;

														facture.save(function(err, bill) {
																if (err)
																		return console.log(err);

																//console.log(bill);
																for (var i = 0; i < bill.orders.length; i++)
																		F.emit('order:recalculateStatus', {
																				userId: self.user._id.toString(),
																				order: {
																						_id: bill.orders[i].toString()
																				}
																		});

																callback(err);
														});
												});
										});

								}, function(err) {
										if (err)
												console.log(err);

										self.json({});
								});

						});
		}
};

//exports.Order = Object;

//exports.Order = Object;