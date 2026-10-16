package com.lnt.chatmee.repository;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import com.lnt.chatmee.model.Report;

@Repository
public interface ReportRepository extends MongoRepository<Report, String> {
}
